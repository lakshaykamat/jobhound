# Jobhound

A daemon that discovers job postings, scores them against your resume, and writes the results to a Google Sheet. One operator, one resume, one Sheet. The Sheet holds jobs; a local `.data/` directory holds cost meters, SerpApi usage, and per-job event logs.

```
SerpApi Google Jobs  →  dedup vs. Sheet  →  analyze + score new ones  →  upsert to Sheet
```

Full design rationale: [`docs/prd.md`](docs/prd.md). Deployment instructions: [`docs/deploy.md`](docs/deploy.md).

---

## What it does

- **Discovers** postings via SerpApi's Google Jobs endpoint (one query → up to 10 results, opt-in pagination).
- **Dedupes** by content-hash `job_id` so the same posting never duplicates across runs.
- **Analyzes** each new posting into a structured record (title, company, salary, work mode, seniority, …).
- **Scores** it 0–100 against a fit profile derived from your resume, with a short rationale.
- **Writes once** per posting. Once a row is in the Sheet, the daemon never touches it again — the row is yours to mark `applied`, `reviewed`, or delete.
- **Tracks all three cost meters locally** — monthly SerpApi searches, LLM tokens, and USD cost — in `.data/usage-YYYY-MM.json`, with per-cycle detail in `.data/cycles.jsonl` and per-job events in `.data/jobs.jsonl`. Refuses to call SerpApi once the monthly cap is reached.

## How a cycle works

```
   ┌────────────────────────────────────────────┐
   │  1. Search Google Jobs                     │
   │                                            │
   │  Runs each of your saved search queries    │
   │  (e.g. "backend engineer noida"). About    │
   │  10 results per query.                     │
   └──────────────────────┬─────────────────────┘
                          ▼
   ┌────────────────────────────────────────────┐
   │  2. Check what's already in the sheet      │
   │                                            │
   │   Seen before?  →  skip (no AI cost)       │
   │   Brand new?    →  keep going              │
   └──────────────────────┬─────────────────────┘
                          ▼
   ┌────────────────────────────────────────────┐
   │  3. Drop postings that are too old         │
   │                                            │
   │  Anything posted more than a week ago      │
   │  is ignored — you set the cutoff.          │
   └──────────────────────┬─────────────────────┘
                          ▼
   ┌────────────────────────────────────────────┐
   │  4. Have AI read and score the job         │
   │                                            │
   │  Compares the job description to your      │
   │  resume profile and assigns 0–100,         │
   │  plus a one-line reason.                   │
   └──────────────────────┬─────────────────────┘
                          ▼
   ┌────────────────────────────────────────────┐
   │  5. Save a new row to your spreadsheet     │
   │                                            │
   │   High score  →  marked as a match         │
   │   Low score   →  saved but tagged filter   │
   │   (existing rows are never edited)         │
   └──────────────────────┬─────────────────────┘
                          ▼
   ┌────────────────────────────────────────────┐
   │  6. Record cost, then sleep                │
   │                                            │
   │  Tracks searches used + AI tokens + USD,   │
   │  then sleeps until the next cycle.         │
   └──────────────────────┬─────────────────────┘
                          ▼
                   loops forever
```

Restarts don't re-fire immediately — the daemon remembers when the last cycle finished and waits out the remainder of `poll_interval_seconds` before starting another.

## Project layout

```
src/
├── adapters/      # External I/O — swap a provider without touching domain logic
│   ├── llm.ts        # OpenAI chat
│   ├── serpapi.ts    # Google Jobs via SerpApi
│   ├── sheets.ts     # Apps Script Web App client (jobs only)
│   └── tracker.ts    # .data/ writer: cycles.jsonl, jobs.jsonl, usage-YYYY-MM.json
├── cli/           # Entrypoints
│   ├── daemon.ts          # the scheduler loop ("npm start")
│   └── verify-sheet.ts    # Sheet + tracker self-test
├── core/          # Pure domain logic
│   ├── process-cycle.ts   # Find → Analyze → Score → Store
│   ├── analyze.ts
│   ├── score.ts
│   ├── dedup.ts
│   └── profile.ts         # normalize the fit_profile read from config.json
├── config.ts
├── pricing.ts     # Hardcoded model prices ($/1M tokens)
└── types.ts

apps-script/Code.gs   # Google Sheets bridge — deploy as a Web App
.data/                # Local meters & event logs (gitignored, Docker volume)
```

## Quick start (Docker)

You'll need: Docker, a SerpApi key, an OpenAI key, and a Google account.

```bash
git clone <this-repo> jobhound
cd jobhound

cp .env.example .env             # fill in 4 values — see docs/deploy.md §3
cp config.example.json config.json   # then hand-edit queries + profile
mkdir -p .data
```

Provision the Google Sheet + Apps Script Web App (one-time step described in [`docs/deploy.md`](docs/deploy.md) §2), then build and start:

```bash
docker compose build
docker compose up -d
docker compose logs -f
```

The daemon loops every `poll_interval_seconds` (default 24 hours), re-reads `config.json` each cycle, and stops cleanly with `docker compose down`.

For end-to-end deployment, Apps Script setup, updating, and troubleshooting, read [`docs/deploy.md`](docs/deploy.md).

## Quick start (without Docker)

Prerequisites: Node.js 22+ on the host. Everything else is the same — `.env` and `config.json`.

```bash
git clone <this-repo> jobhound
cd jobhound

cp .env.example .env             # fill in 4 values — see docs/deploy.md §3
cp config.example.json config.json   # then hand-edit queries + profile
mkdir -p .data
npm install
npm start                        # run the daemon loop in this terminal
```

For long-running operation you'll want a process manager (`pm2`, `systemd`, `tmux`, etc.) — `npm start` runs in the foreground.

## Configuring `config.json`

Copy `config.example.json` to `config.json` and edit by hand. The two sections that actually need your input are:

- **`cycle.queries`** — the SerpApi Google Jobs search strings (e.g. `"backend engineer remote india"`, `"backend engineer bengaluru"`).
- **`profile`** — your fit profile: `skills`, `seniority`, `role_titles`, `locations`, etc. The scorer injects this into the LLM prompt; `skills` and `role_titles` must be non-empty. See `config.example.json` for the full schema and per-field hints.

Everything else has sane defaults — leave it alone unless you have a reason. The daemon re-reads `config.json` every cycle, so edits take effect on the next run with no restart.

## Configuration reference

`config.json`:

| Field | Default | What it controls |
|---|---|---|
| `queries` | *(required)* | Array of SerpApi Google Jobs search strings. Cross-query duplicates collapse to one row. |
| `score_threshold` | `70` | Rows ≥ threshold get `status="new"`; below get `status="filtered"`. Nothing is deleted. |
| `max_pages_per_query` | `1` | Each page = 1 SerpApi search (~10 jobs). Raise carefully — quota burns fast. |
| `max_job_age_days` | `7` | Drop *fresh* postings older than this before analyzing. Known rows are unaffected. |
| `dedup_strategy` | `"title_company_via"` | Use `"title_company"` to collapse cross-source duplicates (LinkedIn + Naukri → one row). |
| `poll_interval_seconds` | `86400` | Daemon sleep between cycles. |
| `monthly_search_cap` | `100` | Daemon refuses to call SerpApi at or above this in the current UTC month. |
| `search_warn_threshold` | `80` | Daemon logs a warning at or above this. |
| `fit_profile` | *(required — generate from resume)* | Profile injected into the scorer prompt. |

`.env`:

| Var | Notes |
|---|---|
| `APPS_SCRIPT_URL` | The `/exec` URL of your Apps Script Web App. |
| `APPS_SCRIPT_TOKEN` | Random secret stored as `SHARED_TOKEN` in Apps Script script properties. |
| `SERPAPI_KEY` | From [serpapi.com](https://serpapi.com). Free tier = 100 searches/month. |
| `OPENAI_KEY` | OpenAI API key. The model is set in `src/constants.ts` (`OPENAI_MODEL`); prices in `src/pricing.ts`. |
| `DATA_DIR` | Optional. Directory for `.data/` files. Defaults to `./.data` locally, `/app/.data` in the Docker image. |

## Common commands

```bash
# build (after pulling new code)
docker compose build

# run a single cycle (no loop)
docker compose run --rm jobhound node dist/cli/daemon.js --once

# verify the Sheet backend (read + write self-test)
docker compose run --rm jobhound node dist/cli/verify-sheet.js

# start the long-running daemon
docker compose up -d
docker compose logs -f

# stop it
docker compose down

# type-check (host, not container)
npm run build
```

## Hard constraints

These are non-negotiable design rules — see [`CLAUDE.md`](CLAUDE.md):

- The Sheet is the jobs database (job rows only). `.data/` is the local meters & observability store (`cycles.jsonl`, `jobs.jsonl`, `usage-YYYY-MM.json`, `last-cycle.json`). No other persistence.
- Write-once: the daemon never edits an existing sheet row. Re-discovery of a known `job_id` just emits a `skipped-known` event.
- Idempotent via `job_id` = `hash(normalized_title + company + via)`.
- Dedup before LLM. Known `job_id` skips analyze + score; only new postings burn tokens.
- API-only discovery. No logged-in scraping.
- Per-posting `try/catch`. One bad posting never aborts a cycle (becomes an `errored` event in `jobs.jsonl`).
- All three cost meters are logged per cycle (SerpApi searches + LLM tokens + USD).
- Config re-read each cycle.

## Coverage limits

Google Jobs aggregates Indeed, LinkedIn, Naukri, and most company career pages. It does **not** cover Wellfound, Cutshort, Instahyre, Hirect, or Uplers — those are login-walled and out of scope for v1. See `docs/prd.md` §7.

## License

Private; single-operator deployment.
