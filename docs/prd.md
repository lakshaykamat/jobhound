# Job Finder — Product Requirements Document

**Status:** Draft v0.2
**Owner:** Lakshay
**Last updated:** 2026-06-04
**Changes in v0.2:** Discovery rebuilt around a single job-aggregator API (SerpApi Google Jobs) instead of per-platform scrapers. Added resume-to-profile extraction. Documented coverage limits.

---

## 1. Summary

Job Finder is a stateless background worker that discovers job postings, extracts structured data from each, scores it against a fit profile derived from the operator's resume, and writes the results to a Google Sheet. It runs as a daemon — a long-lived scheduler loop — but holds no durable in-memory state. The Google Sheet is the single source of truth; any run can be killed and restarted without data loss or duplication.

Discovery uses one aggregator API (SerpApi's Google Jobs endpoint) rather than scraping individual job boards. Google Jobs aggregates Indeed, LinkedIn, Naukri, and thousands of other sources into one query, localized to India. This collapses discovery from eight fragile scrapers to a single API call and keeps the design login-free and stateless.

The pipeline is four stages: **Find → Analyze → Score → Store**.

---

## 2. Problem

Job discovery is manual, repetitive, and noisy. Relevant postings are scattered across boards, refresh constantly, and most are a poor fit. Reviewing them by hand burns time and you still miss listings that expire before you see them. The goal is to automate discovery and triage so a human only ever looks at a pre-scored, deduplicated shortlist.

---

## 3. Goals & Non-goals

**Goals**

- Discover job postings matching configured search queries via the Google Jobs aggregator.
- Extract a consistent structured record from each posting.
- Derive the fit profile automatically from an uploaded resume.
- Score each posting 0–100 against that profile, with a short rationale.
- Persist results to Google Sheets, deduplicated and idempotent across runs.
- Run unattended as a daemon with no manual intervention between cycles.

**Non-goals**

- No application submission or auto-apply. The tool surfaces, it does not act.
- No per-platform scraping, no logged-in sessions, no headless browser for auth. Discovery is API-only.
- No user accounts or multi-tenant support. Single operator, single resume/profile per deployment.
- No internal database or persistent cache. State lives in the Sheet, full stop.

---

## 4. Users

A single operator (a job seeker) who uploads a resume once, sets a few search queries, runs the daemon, and reads the resulting Sheet. The Sheet doubles as the interface — readable and filterable by a non-technical person.

---

## 5. Core design principle: statelessness as idempotency

"Daemon" and "stateless" are in tension, and the resolution is the most important decision in this document, so it's stated first.

The daemon is a thin scheduler loop. All real work happens inside one pure function:

```
process_cycle(config, profile, sheet) -> writes to sheet
```

`process_cycle` reads the current state of the world (existing rows in the Sheet) at the start of every run, does its work, and writes back. It carries nothing forward in memory. This gives three properties:

- **Crash-safe.** Kill the process mid-cycle and the next cycle reconstructs everything from the Sheet. A partially-processed posting is simply re-processed, which is harmless because writes are idempotent. Meter and event writes to `.data/` are append-only, so a crash mid-write at worst loses one in-flight line.
- **Idempotent.** Every posting gets a stable `job_id` derived from its content (see §9). Before writing, the worker checks whether that `job_id` already exists. Same posting seen twice → one row, updated in place, never duplicated.
- **Restartable.** Config change, deploy, or reboot requires no migration. The new process reads the Sheet and continues.

**Job state lives in the Sheet.** No Redis, no SQLite. The aggregator-API discovery model reinforces this: each Find call is a stateless HTTP request with nothing to persist or refresh.

**Cost & observability state lives in `.data/`** (`cycles.jsonl`, `jobs.jsonl`, `usage-YYYY-MM.json`). This is the *one* exception to "no local state files." The justification: enforcing the SerpApi monthly cap, attributing USD spend, and answering "what happened in cycle X" all require running totals and event logs that would clutter the Sheet and slow `monthlyUsage()` queries as cycles accumulate. `.data/` is append-only JSONL + one small JSON-per-month; if wiped, the daemon resets month-to-date usage (cap re-arms from zero) and loses event history — no functional regression beyond that.

---

## 6. Functional requirements

### 6.1 Find (SerpApi Google Jobs)

Given a set of search queries, return candidate postings for the current cycle from one source: SerpApi's Google Jobs endpoint (`engine=google_jobs`).

- **One adapter, not eight.** Google Jobs aggregates Indeed, LinkedIn, Naukri, company career pages, and many specialist boards. A single query returns results across all of them.
- **Localization.** Queries are issued with `gl=in` and `hl=en` so results are India-localized.
- **Results per call.** Google Jobs returns **up to 10 results per page**. The `num` parameter is no longer supported, so there is no way to pull more than 10 in one call.
- **Pagination is opt-in and metered.** Additional pages are fetched via `next_page_token`, and *each page is billed as a separate search*. Default is **page 1 only per query** (10 jobs). A `max_pages_per_query` config knob allows fetching deeper when needed.
- **Full descriptions inline.** The first-page response already includes each job's description, so the 10 results are immediately analyzable — no separate detail-fetch call required.
- Each result yields: title, company, location, posting source (`via`, e.g. LinkedIn/Indeed/Naukri), apply link, description, and salary/schedule when the source published it.
- Find must back off and retry on API errors rather than hammering, and respect the monthly search quota (see §10).

### 6.2 Profile (resume-derived, one-time)

The fit profile is generated from the operator's resume, not hand-written.

- Operator uploads a resume once (PDF or text).
- An LLM extracts a structured profile: skills, seniority, years of experience, domains, role titles, location/remote preference, and inferred comp band.
- The extracted profile is stored in config (e.g. a dedicated tab in the Sheet or a config file) and reused every cycle. It is regenerated only when the operator re-uploads a resume.
- The operator may override or tweak any extracted field — extraction is the starting point, not a lock.

### 6.3 Analyze

Given a raw posting, normalize it into the record schema (§9).

- Extract: title, company, location, work mode, salary range (if present), seniority, posting date, source, apply URL, and cleaned description text.
- Since Google Jobs returns reasonably structured data, Analyze is mostly normalization; LLM assistance is used only to infer fields the source left implicit (e.g. seniority, remote/onsite from description).
- Degrade gracefully — a missing salary yields `null`, not a failed record.

### 6.4 Score

Given a structured record and the resume-derived profile, produce a `score` (0–100) and a one-to-two-sentence `rationale`.

- **Dedup before scoring.** The worker checks `job_id` against existing rows *first*. A known job is never re-scored; it gets a cheap in-place `last_seen` update. Only genuinely new jobs reach the LLM scorer. This is the main cost control.
- The scorer is **strict by default** — bias toward lower scores, penalize vague or mismatched postings, and never invent qualifications the posting doesn't state.
- Output is deterministic in shape: always a number plus a rationale, even on a weak match.
- A configurable `score_threshold` flags rows for attention but never deletes low-scoring rows — everything is stored for auditability.

### 6.5 Store

Given scored records, upsert them into the Google Sheet.

- Match on `job_id`. Present → update the row; absent → append.
- Writes are batched per cycle to stay within Sheets API quotas.
- The worker never deletes rows. Stale postings are marked, not removed.

---

## 7. Coverage & limitations

Discovery is bounded by what Google Jobs aggregates. This is a deliberate trade for simplicity and statelessness, and it has known gaps:

- **Covered well:** Indeed, LinkedIn, Naukri, and company career pages all feed Google Jobs and surface in India-localized queries.
- **Not covered:** Wellfound, Cutshort, Instahyre, Hirect, and Uplers are login-walled and largely do not feed Google Jobs, so they will not appear. There is no clean, stateless, no-login way to reach them; the only path is logged-in scraping, which is explicitly out of scope (ban risk + breaks statelessness). These five are accepted as out of reach for v1.
- **Partial aggregation:** Not every posting on every covered board appears in Google Jobs, and salary is present only when the original source published it. Coverage is "most relevant listings," not "every listing."

---

## 8. Configuration

A single config defines a deployment.

```yaml
serpapi:
  api_key: "<serpapi-key>"
  gl: "in"
  hl: "en"
  max_pages_per_query: 1          # 1 page = 10 jobs = 1 search
queries:
  - "backend engineer node.js delhi"
  - "typescript engineer remote india"
  - "nestjs developer"
poll_interval_seconds: 86400      # once a day keeps free-tier usage low
score_threshold: 70               # rows >= threshold flagged for attention
resume_path: "resume.pdf"         # source for the derived profile
fit_profile:                      # auto-extracted from resume; operator-editable
  skills: []
  seniority: ""
  comp_floor: null
  locations: ["remote", "delhi ncr"]
```

The `fit_profile` is populated by the resume extraction step and injected into the scoring prompt. Config is re-read at the start of each cycle (cheap, given statelessness), so query or profile changes take effect on the next run with no redeploy.

---

## 9. Data model

One row per job. The sheet is the schema.

| Column | Type | Notes |
|---|---|---|
| `job_id` | string | Stable hash of `(normalized title + company + via)`. The dedup key. Google's own opaque job token is volatile, so we derive our own. |
| `title` | string | |
| `company` | string | |
| `location` | string | |
| `work_mode` | enum | `remote` / `hybrid` / `onsite` / `unknown` |
| `salary_min` | number? | nullable |
| `salary_max` | number? | nullable |
| `seniority` | string? | |
| `source` | string | the `via` field from Google Jobs (LinkedIn / Indeed / Naukri / etc.) |
| `apply_url` | string | apply link from the result |
| `posted_date` | date? | |
| `score` | int | 0–100 |
| `rationale` | string | scorer's short justification |
| `status` | enum | `new` / `reviewed` / `applied` / `stale` (operator-editable) |
| `first_seen` | datetime | set on insert, never overwritten |
| `last_seen` | datetime | updated every cycle the posting is re-found |

`job_id` is content-derived so statelessness works: the same posting always hashes to the same id, so re-discovery updates `last_seen`/`score` in place instead of duplicating.

---

## 10. Operational requirements

- **Deployment:** single container, single process. Restart policy `always`; statelessness makes restarts free. *(Hosting target — see open questions.)*
- **Auth:** SerpApi key and LLM key via env. Google service account with edit access to the target Sheet, mounted as a secret.
- **Search-quota discipline:** SerpApi's free tier is 100 searches/month, and unused searches don't roll over. With `max_pages_per_query: 1` and a daily poll across ~3 queries, usage is ~90 searches/month — inside free tier. The worker tracks and logs cumulative searches per calendar month and warns before the cap. Upgrade path: SerpApi paid tier or a no-expiry PAYG provider (e.g. Scrapingdog) if volume grows.
- **Three cost meters per cycle:** SerpApi searches govern *discovery* (10 jobs/search). LLM analyze+score is a *separate* spend, billed per new job, protected by dedup-before-scoring. USD cost is derived from a hardcoded `MODEL_PRICES` table (`src/pricing.ts`). All three log to stdout and `.data/cycles.jsonl`; running totals roll up in `.data/usage-YYYY-MM.json` and drive cap enforcement.
- **Sheets quota:** batch writes, exponential backoff on 429s. Only job rows hit the Sheet — cost & event logging is local, so cycle frequency does not eat Sheets quota.
- **Observability:** each cycle logs counts — searches used, jobs found, new vs. known, scored, inserted, updated, errored — plus running monthly search/token/USD totals. Per-job detail (find / skipped-known / analyzed / scored / errored, with tokens and USD per stage) appends to `.data/jobs.jsonl`, queryable with `jq`.
- **Failure isolation:** one bad posting must not abort a cycle. Per-posting try/catch; errored postings logged to `.data/jobs.jsonl` and skipped, cycle continues.

---

## 11. Risks & open questions

- **Coverage gaps (accepted).** Five target platforms are unreachable via Google Jobs (§7). If any becomes business-critical, revisit — but the only path is out-of-scope logged-in scraping.
- **Cross-source duplicates.** The same role can surface via multiple `via` sources (LinkedIn *and* Naukri). Current `job_id` includes `via`, so these would appear as separate rows. *Open: collapse cross-source dupes by hashing on `(title + company)` only, with `via` stored as a multi-value field? Needs a decision.*
- **Hosting.** Where does the daemon run? *Open: existing Ubuntu server, a small always-on VPS, or a scheduled serverless function (which fits statelessness especially well)?*
- **Scorer quality.** LLM scoring can inflate fit. Mitigated by a strict, fabrication-resistant prompt and stored rationale. *Open: a small human-labeled calibration set to check accuracy over time?*
- **Sheets as a database.** Fine at one-person volume; not built for high write throughput. Acceptable here, but the ceiling exists.
- **Staleness detection.** A posting found last cycle but not this one — expired, or just not returned? Need a rule (e.g. mark `stale` after K cycles unseen).

---

## 12. Success metrics

- **Shortlist precision:** of postings scored ≥ threshold, the share the operator marks worth pursuing. Target ≥ 60% in v1.
- **Zero duplicates:** no `job_id` appears twice across run history.
- **Free-tier fit:** monthly SerpApi searches stay under 100 at default settings.
- **Uptime:** daemon completes scheduled cycles without intervention over a 7-day window.
- **Cost per useful lead:** total LLM spend ÷ postings the operator acts on.

---

## 13. Milestones

1. **M1 — Core pipeline.** `process_cycle` end-to-end: one SerpApi query → normalize → score → upsert to Sheet with dedup. Manual run.
2. **M2 — Resume profile.** Resume upload → LLM profile extraction → injected into scorer.
3. **M3 — Daemonize.** Scheduler loop, clean shutdown, config-driven, quota tracking, logging of both cost meters.
4. **M4 — Hardening.** Multi-query, pagination knob, staleness rules, cross-source dedup decision, calibration check.