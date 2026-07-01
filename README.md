# Jobhound

Finds job postings, scores them against your resume, and keeps the good ones in a local jobs store you browse from a dashboard. One operator, one resume, one machine.

```
SerpApi Google Jobs  →  dedup vs. jobs store  →  score new ones  →  write to jobs store
```

Dashboard runs at `http://localhost:8787` with Start / Stop / Run-once buttons and a live event feed. The server boots paused so it won't burn your SerpApi quota while you're still setting things up.

Design rationale lives in [`docs/prd.md`](docs/prd.md). Setup steps are in [`docs/deploy.md`](docs/deploy.md).

## What it does

- Pulls postings from SerpApi's Google Jobs endpoint.
- Hashes `title + company + via` into a `job_id` and skips anything it's already seen — known postings never hit the LLM.
- Drops postings older than `max_job_age_days` (default 7).
- Sends what's left through GPT for a 0–100 fit score and a one-liner.
- Writes the row once into `.data/jobs.json`. After that the row is yours — mark it `applied`, delete it, whatever. The server won't touch it again.
- Tracks SerpApi searches, tokens, and USD locally in `.data/`. Stops calling SerpApi when you hit `monthly_search_cap`.

## A cycle

```
1. Run each saved query (~10 results per page)
2. Drop anything already in the local jobs store
3. Drop anything older than the cutoff
4. Score what's left against your resume profile
5. Append new rows to .data/jobs.json (atomic .tmp + rename)
6. Log the cost, sleep until next cycle
```

Loops forever once you hit Start. Sleeps `poll_interval_seconds` between cycles (default 6h). Re-reads `config.json` every cycle, so edits take effect on the next run.

## Layout

This is a pnpm workspace with two packages:

```
packages/
├── server/                  # the daemon — pulls, scores, writes
│   ├── src/
│   │   ├── adapters/        # jobs-store, llm, serpapi, tracker, retry
│   │   ├── cli/             # server.ts (pnpm start), startup.ts
│   │   ├── core/            # process-cycle, dedup, score, analyze, profile,
│   │   │                    # posted-at, event-bus, server-state, observable-tracker
│   │   ├── config.ts
│   │   ├── constants.ts     # model id lives here
│   │   ├── pricing.ts       # hardcoded $/1M token prices — update when OpenAI changes them
│   │   ├── prompts.ts
│   │   ├── logger.ts
│   │   └── types.ts
│   ├── web/                 # Tailwind-CDN dashboard, no build step
│   ├── tests/               # vitest unit + integration suite
│   ├── config.json          # gitignored — your queries + fit_profile
│   ├── .data/               # local jobs store + meters + event logs (gitignored, mount as volume)
│   └── Dockerfile           # multi-stage; build context is the REPO ROOT
└── landing/                 # marketing site — Vite + React + TS + Tailwind v4 + shadcn primitives
    ├── index.html
    ├── src/
    └── vite.config.ts
```

From the repo root:

```bash
pnpm install                        # one-shot, picks up both packages
pnpm start                          # boots the server (paused) on :8787
pnpm typecheck                      # tsc on the server
pnpm test                           # vitest on the server
pnpm landing                        # vite dev server for the landing page
pnpm landing:build                  # production build of the landing page
```

## Config

Everything below lives inside `packages/server/`.

`config.json` — the only two fields you actually need to edit:

- **`queries`** — SerpApi search strings, e.g. `"backend engineer remote india"`.
- **`fit_profile`** — your resume distilled into `skills`, `seniority`, `role_titles`, `locations`, etc. Goes straight into the scorer prompt. `skills` and `role_titles` must be non-empty.

Everything else has defaults that work:

| Field | Default | Notes |
|---|---|---|
| `score_threshold` | `70` | Below this, row gets `status="filtered"` instead of `"new"`. Nothing is deleted. |
| `max_pages_per_query` | `1` | Each page = one SerpApi search. Quota burns fast. |
| `max_job_age_days` | `7` | Only filters fresh postings — known rows aren't touched. |
| `dedup_strategy` | `"title_company_via"` | Switch to `"title_company"` to collapse LinkedIn + Naukri duplicates into one row. |
| `server.poll_interval_seconds` | `21600` | Sleep between cycles. |
| `server.http_port` | `8787` | Override with `PORT`. |
| `monthly_search_cap` | `100` | Free SerpApi tier. Server refuses to call past this. |
| `search_warn_threshold` | `80` | Logs a warning past this. |

`.env`:

| Var | What |
|---|---|
| `DATA_DIR` | Where `.data/` lives. Defaults to `./.data` (cwd-relative) locally, `/app/.data` in Docker. |
| `PORT` | Override the dashboard port (default `8787`). |
| `LOG_LEVEL` / `LOG_FORMAT` | Logger knobs. Defaults are sensible. |

## Constraints (don't break these)

- All data lives in `.data/`. `jobs.json` is the jobs database (full rows, atomic writes); `cycles.jsonl`, `jobs.jsonl`, `usage-YYYY-MM.json`, and `last-cycle.json` hold the event log and meters. No external persistence — no Sheet, no Redis, no SQLite.
- Write-once. The server never edits an existing row. Re-seeing a known `job_id` just emits a `skipped-known` event.
- Dedup runs before the LLM. Known postings cost zero tokens.
- API only. No logged-in scraping.
- Every posting is wrapped in try/catch. A bad one becomes an `errored` event, not a dead cycle.
- All three meters (searches + tokens + USD) get logged per cycle.

Full list in [`CLAUDE.md`](CLAUDE.md).

## Coverage

Google Jobs covers Indeed, LinkedIn, Naukri, and most company career pages. It doesn't cover Wellfound, Cutshort, Instahyre, Hirect, or Uplers — those are login-walled and out of scope. See `docs/prd.md` §7.

## License

Private; single-operator deployment.
