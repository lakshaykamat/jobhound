# Job Finder

A daemon that discovers job postings, scores them against your resume, and writes the results to a Google Sheet. One operator, one resume, one Sheet. The Sheet holds jobs; a local `.data/` directory holds cost meters, SerpApi usage, and per-job event logs.

```
SerpApi Google Jobs  →  analyze  →  score vs. your profile  →  upsert to Google Sheet
```

Full design rationale: [`docs/prd.md`](docs/prd.md). Deployment instructions: [`docs/deploy.md`](docs/deploy.md).

---

## What it does

- **Discovers** postings via SerpApi's Google Jobs endpoint (one query → up to 10 results, opt-in pagination).
- **Analyzes** each posting into a structured record (title, company, salary, work mode, seniority, …).
- **Scores** each new posting 0–100 against a fit profile derived from your resume, with a short rationale.
- **Dedupes** by content-hash `job_id` so the same posting never duplicates across runs.
- **Marks stale** rows that haven't been re-found within `staleness_days`.
- **Tracks all three cost meters locally** — monthly SerpApi searches, LLM tokens, and USD cost — in `.data/usage-YYYY-MM.json`, with per-cycle detail in `.data/cycles.jsonl` and per-job events in `.data/jobs.jsonl`. Refuses to call SerpApi once the monthly cap is reached.

## Project layout

```
src/
├── adapters/      # External I/O — swap a provider without touching domain logic
│   ├── llm.ts        # OpenAI chat
│   ├── resume.ts     # PDF / TXT reader
│   ├── serpapi.ts    # Google Jobs via SerpApi
│   ├── sheets.ts     # Apps Script Web App client (jobs only)
│   └── tracker.ts    # .data/ writer: cycles.jsonl, jobs.jsonl, usage-YYYY-MM.json
├── cli/           # Entrypoints
│   ├── bootstrap.ts       # one-shot setup: resume → config.json
│   ├── daemon.ts          # the scheduler loop ("npm start")
│   └── verify-sheet.ts    # Sheet + tracker self-test
├── core/          # Pure domain logic
│   ├── process-cycle.ts   # Find → Analyze → Score → Store
│   ├── analyze.ts
│   ├── score.ts
│   ├── dedup.ts
│   ├── profile.ts
│   └── queries.ts         # derive SerpApi queries from a fit_profile
├── config.ts
├── pricing.ts     # Hardcoded model prices ($/1M tokens)
└── types.ts

apps-script/Code.gs   # Google Sheets bridge — deploy as a Web App
.data/                # Local meters & event logs (gitignored, Docker volume)
```

## Quick start (Docker)

You'll need: Docker, a SerpApi key, an OpenAI key, a Google account, and your resume as PDF or TXT.

```bash
git clone <this-repo> job-finder
cd job-finder

cp .env.example .env             # fill in 4 values — see docs/deploy.md §3
mkdir -p data .data
cp ~/path/to/your/resume.pdf data/resume.pdf
```

Then provision the Google Sheet + Apps Script Web App (a one-time step described in [`docs/deploy.md`](docs/deploy.md) §2), build, and run the one-shot bootstrap:

```bash
docker compose build

# Bootstrap: reads data/resume.pdf, extracts your fit_profile via OpenAI,
# derives sensible queries, writes config.json from built-in defaults, exits.
docker compose run --rm job-finder node dist/cli/bootstrap.js

# Start the daemon:
docker compose up -d
docker compose logs -f
```

The daemon loops every `poll_interval_seconds` (default 24 hours), re-reads `config.json` each cycle, and stops cleanly with `docker compose down`.

For end-to-end deployment, Apps Script setup, updating, and troubleshooting, read [`docs/deploy.md`](docs/deploy.md).

## Quick start (without Docker)

Prerequisites: Node.js 22+ on the host. Everything else is the same — `.env` and your resume.

```bash
git clone <this-repo> job-finder
cd job-finder

cp .env.example .env             # fill in 4 values — see docs/deploy.md §3
mkdir -p data .data
cp ~/path/to/your/resume.pdf data/resume.pdf

./bootstrap                      # installs deps if needed, runs bootstrap, exits
npm start                        # run the daemon loop in this terminal
```

`./bootstrap` is a thin shell wrapper around `npm run bootstrap`. It checks `.env` exists, runs `npm install` once if `node_modules/` is missing, then hands off to the same `bootstrap.ts` the Docker path uses. Forwards extra args:

```bash
./bootstrap --force                       # overwrite an existing config.json
./bootstrap path/to/specific/resume.pdf   # explicit path instead of auto-detect
```

For long-running operation you'll want a process manager (`pm2`, `systemd`, `tmux`, etc.) — `npm start` runs in the foreground.

## Bootstrap details

`bootstrap` is a one-shot setup command:

1. Validates the four required env vars (`APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`, `SERPAPI_KEY`, `OPENAI_KEY`).
2. Auto-detects your resume: looks for `data/resume.pdf`, then `data/resume.txt`, then any single `.pdf`/`.txt` in `data/`.
3. Calls OpenAI once to extract `fit_profile` (skills, seniority, role titles, locations, …).
4. Derives 2–3 SerpApi queries from your top role titles × locations — e.g. `"backend engineer remote india"`.
5. Writes a complete `config.json` from built-in defaults + extracted profile + derived queries.
6. Refuses to overwrite an existing populated `config.json` unless you pass `--force`.

After bootstrap, open `config.json` and hand-edit anything you want different — `queries` are the most likely candidate for tweaks. The daemon re-reads `config.json` every cycle, so edits take effect on the next run with no restart.

Re-run when your resume changes:

```bash
docker compose run --rm job-finder node dist/cli/bootstrap.js --force
```

`--force` regenerates `queries` too, so if you've hand-tuned them, copy them out of `config.json` first and paste them back after.

## Configuration reference

`config.json`:

| Field | Default | What it controls |
|---|---|---|
| `queries` | *(required)* | Array of SerpApi Google Jobs search strings. Cross-query duplicates collapse to one row. |
| `score_threshold` | `70` | Rows ≥ threshold are "shortlisted" for your attention; the scorer never deletes anything. |
| `max_pages_per_query` | `1` | Each page = 1 SerpApi search (~10 jobs). Raise carefully — quota burns fast. |
| `staleness_days` | `14` | Unseen rows older than this flip to `stale`. `applied` rows are never auto-staled. |
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

# one-shot setup: extract profile + derive queries + write config.json
docker compose run --rm job-finder node dist/cli/bootstrap.js [--force]

# run a single cycle (no loop)
docker compose run --rm job-finder node dist/cli/daemon.js --once

# verify the Sheet backend (read + write self-test)
docker compose run --rm job-finder node dist/cli/verify-sheet.js

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

- The Sheet is the jobs database (job rows only). `.data/` is the local meters & observability store (`cycles.jsonl`, `jobs.jsonl`, `usage-YYYY-MM.json`). No other persistence.
- `process_cycle` reads Sheet → does work → writes Sheet + appends to `.data/`. Crash-safe via append-only writes.
- Idempotent via `job_id`. The same posting always hashes to the same id; re-discovery updates `last_seen` in place.
- Dedup before LLM. Known `job_id` skips analyze + score; only new postings burn tokens.
- API-only discovery. No logged-in scraping.
- Per-posting `try/catch`. One bad posting never aborts a cycle (becomes an `errored` event in `jobs.jsonl`).
- All three cost meters are logged per cycle (SerpApi searches + LLM tokens + USD).
- Config re-read each cycle.

## Coverage limits

Google Jobs aggregates Indeed, LinkedIn, Naukri, and most company career pages. It does **not** cover Wellfound, Cutshort, Instahyre, Hirect, or Uplers — those are login-walled and out of scope for v1. See `docs/prd.md` §7.

## License

Private; single-operator deployment.
