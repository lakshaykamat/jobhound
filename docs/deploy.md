# Deployment

End-to-end ops guide. Primary path uses Docker + Compose v2; a non-Docker path (Node 22+ on the host) is documented in §14.

---

## 1. Prerequisites

- Docker 24+ and Docker Compose v2 (or Node.js 22+ for the non-Docker path — see §14).
- A Google account that can create a Sheet and run Apps Script.
- A SerpApi account ([serpapi.com](https://serpapi.com)) — free tier is 100 searches/month.
- An OpenAI account with API access.
- Your resume as `.pdf` or `.txt`.

## 2. Provision the Google Sheet + Apps Script Web App

1. Create a new Google Sheet (any name).
2. Extensions → Apps Script. Replace the default `Code.gs` with the contents of [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Project Settings (gear icon) → **Script properties** → add a property: `SHARED_TOKEN` = any random string. Save it; you'll need it in `.env`.
4. Deploy → **New deployment** → Type **Web app**:
   - Description: `job-finder`
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**, copy the `/exec` URL.
6. Whenever `apps-script/Code.gs` changes, repeat with **Manage deployments → edit → New version**.

## 3. Clone the repo and configure secrets

```bash
git clone <this-repo> job-finder
cd job-finder

cp .env.example .env
mkdir -p data .data
```

Edit `.env` and fill all four values:

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_TOKEN=<the SHARED_TOKEN you set in step 2>
SERPAPI_KEY=<your SerpApi key>
OPENAI_KEY=<your OpenAI key>
```

## 4. Build the image

```bash
docker compose build
```

## 5. Drop your resume and bootstrap config.json

Place your resume in `data/`. `.pdf` or `.txt` both work; the bootstrap command auto-detects `data/resume.pdf` first, then `data/resume.txt`, then any single `.pdf`/`.txt` in the directory.

```bash
cp ~/Documents/resume.pdf data/resume.pdf
```

Run the one-shot bootstrap. It validates `.env`, calls OpenAI once to extract your `fit_profile`, deterministically derives 2–3 search queries from your top role titles × locations, and writes a complete `config.json` from built-in defaults:

```bash
docker compose run --rm job-finder node dist/cli/bootstrap.js
```

The command prints the resulting config and refuses to overwrite an existing populated `config.json` (pass `--force` for a clean rebuild). Open `config.json` afterward and tweak — `queries` are the most likely candidate for adjustment, and you may want to fill in `comp_floor` (the extractor leaves it `null` unless the resume states comp explicitly). The daemon re-reads `config.json` every cycle, so edits take effect on the next run without restart.

The generated `config.json` looks like:

```json
{
  "queries": ["senior backend engineer remote india", "senior backend engineer bengaluru"],
  "score_threshold": 70,
  "max_pages_per_query": 1,
  "staleness_days": 14,
  "dedup_strategy": "title_company_via",
  "poll_interval_seconds": 86400,
  "monthly_search_cap": 100,
  "search_warn_threshold": 80,
  "fit_profile": {
    "skills": ["typescript", "node.js", "postgres", "kafka"],
    "seniority": "senior",
    "years_experience": 6,
    "domains": ["fintech", "saas"],
    "role_titles": ["senior backend engineer", "backend engineer"],
    "locations": ["remote", "bengaluru"],
    "comp_floor": null,
    "notes": ""
  }
}
```

## 6. Verify the Sheet backend and tracker

Before burning SerpApi / OpenAI quota, verify the Sheet bridge and `.data/` writer:

```bash
docker compose run --rm job-finder node dist/cli/verify-sheet.js
```

Runs read checks against the production `Jobs` tab (`ensureHeader`, `readAll`), then Sheet write checks (create sheet → write header → append row → read back → update cell) on a **temporary sheet that's deleted automatically** in the same Apps Script call. Then exercises the local Tracker by writing/reading a JSONL line and a monthly usage rollup in a tmp dir. Your production `Jobs` tab and `.data/` files are not touched. Exits non-zero on any failure.

If `selfTest` fails with `unknown action`, your Apps Script deployment is out of date — re-deploy `apps-script/Code.gs` (step 2 item 6).

## 7. Smoke test with a single cycle

```bash
docker compose run --rm job-finder node dist/cli/daemon.js --once
```

Expected: log lines from each stage, a `cycle complete: {...}` summary, one new line in `.data/cycles.jsonl`, per-job lines in `.data/jobs.jsonl`, and an updated `.data/usage-YYYY-MM.json`. New job postings appear in the `Jobs` tab of your Sheet with scores and rationales.

## 8. Start the daemon

```bash
docker compose up -d
docker compose logs -f
```

The daemon loops every `poll_interval_seconds` (24 hours by default), re-reading `config.json` each cycle. SIGTERM (sent by `docker compose down`) interrupts the sleep and exits cleanly.

## 9. Updating

When code changes:

```bash
git pull
docker compose build
docker compose up -d
```

When `apps-script/Code.gs` changes: redeploy via the Apps Script editor (step 2, item 6). **Until you redeploy, cycles will fail with `unknown action`.**

When your **resume** changes: drop the new file into `data/` and re-run bootstrap with `--force`. This regenerates everything — if you've hand-tuned `queries` in `config.json`, copy them out first and paste them back after.

```bash
docker compose run --rm job-finder node dist/cli/bootstrap.js --force
```

## 10. Stopping

```bash
docker compose down
```

A stopped daemon loses nothing — the Sheet has every job, and `.data/` (mounted as a volume) has every meter and event.

## 11. Quota & cost meters

Per-cycle log line (also one line in `.data/cycles.jsonl`):

```
cost meters — cycle: 2 searches / 4831 tokens / $0.0241 · month 2026-06: 47/100 searches, 112450 tokens, $0.5612
```

The daemon skips the SerpApi call once monthly searches hit `monthly_search_cap` (default 100). To raise the cap: upgrade SerpApi and bump the value in `config.json`.

**Where each meter lives:**

| File | Purpose |
|---|---|
| `.data/usage-YYYY-MM.json` | Month-to-date totals (searches, tokens, USD, cycles). Source of truth for cap enforcement. |
| `.data/cycles.jsonl` | One JSON object per cycle (timestamp, duration_ms, all counts, cost_usd). Tail with `tail -f` or query with `jq`. |
| `.data/jobs.jsonl` | One object per posting event (`found`, `skipped-known`, `analyzed`, `scored`, `errored`) with tokens + cost per stage. |

`.data/` is mounted from the host (`./.data` ↔ `/app/.data`) so contents survive `docker compose down/build/up`. **If you delete `.data/`, the daemon will reset month-to-date usage to zero and ignore the cap until it accumulates again.**

**Useful queries:**

```bash
# total spend this month
jq '.cost_usd' .data/usage-$(date -u +%Y-%m).json

# top-scored jobs from cycles.jsonl is not the right place — that's per-cycle totals.
# for per-job: grab scored events with score >= 80
jq -c 'select(.action == "scored" and .score >= 80)' .data/jobs.jsonl

# count errors today
jq -c "select(.action == \"errored\" and (.timestamp | startswith(\"$(date -u +%Y-%m-%d)\")))" .data/jobs.jsonl | wc -l
```

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `unknown action: ...` from Apps Script | Re-deploy `apps-script/Code.gs` (see step 2 item 6). |
| Cap not enforcing / month-to-date shows zero | `.data/usage-YYYY-MM.json` is missing or was deleted. Cap will re-arm as the month accumulates. |
| `ENOENT` writing to `.data/` | The `./.data` host directory doesn't exist. `mkdir -p .data` and restart. |
| `APPS_SCRIPT_URL env var required` | `.env` is missing or `env_file` not loaded. Re-run after `cp .env.example .env` and filling values. |
| `SerpApi HTTP 401` | Wrong/expired `SERPAPI_KEY`. |
| `OpenAI HTTP 401` | Wrong/expired `OPENAI_KEY`. |
| Cycle log shows `errored: N > 0` | One or more postings hit a per-posting error; check warnings just above. The cycle continues by design. |
| `SerpApi cap reached for YYYY-MM` | Expected once monthly usage ≥ `monthly_search_cap`. Wait for month rollover, raise the cap, or upgrade your plan. |
| Daemon won't stop on Ctrl-C | Use `docker compose down`. The container forwards SIGTERM; the daemon aborts its sleep and exits within a few seconds. |

## 13. File map

```
.
├── apps-script/Code.gs       # Sheets bridge — deploy as a Web App
├── bootstrap                 # Shell wrapper: ./bootstrap → npm run bootstrap (non-Docker path)
├── config.json               # Your runtime config (gitignored; generated by `bootstrap`)
├── data/                     # Mount point for your resume (read-only into the container)
├── .data/                    # Local meters & event logs (gitignored, RW Docker volume)
├── .env                      # Secrets (gitignored)
├── docker-compose.yml        # Single-service compose
├── Dockerfile                # Multistage build → node dist/cli/daemon.js
└── src/
    ├── adapters/             # External I/O: llm, resume (PDF), serpapi, sheets, tracker
    ├── cli/                  # Entrypoints: bootstrap, daemon, verify-sheet
    ├── core/                 # Domain logic: process-cycle, analyze, score, dedup, profile, queries
    ├── config.ts
    ├── pricing.ts
    └── types.ts
```

## 14. Running without Docker

The exact same code paths work directly on the host — Docker is just packaging. Use this when iterating locally or running on a machine where Docker is overkill.

**Prerequisites:** Node.js 22+ and the four `.env` keys filled in (same as the Docker path).

```bash
git clone <this-repo> job-finder
cd job-finder

cp .env.example .env             # fill in 4 values
mkdir -p data .data
cp ~/Documents/resume.pdf data/resume.pdf

./bootstrap                      # installs deps if needed → runs bootstrap → exits
npm run verify-sheet             # optional: smoke-test Sheet + tracker
npm start                        # daemon loop in the foreground
```

`./bootstrap` is a thin shell wrapper:

1. Checks `.env` exists; aborts with a clear message if not.
2. Runs `npm install` once if `node_modules/` is missing.
3. Hands off to `npm run bootstrap` (which runs `src/cli/bootstrap.ts` via `ts-node`).
4. Forwards extra args, so `./bootstrap --force` and `./bootstrap path/to/resume.pdf` both work.

**For long-running operation**, wrap `npm start` in a process manager (`pm2`, `systemd`, `tmux`) — there's no daemonization built into the Node entrypoint itself; that's what Docker's `restart: always` was buying you.

A minimal systemd unit:

```ini
# /etc/systemd/system/job-finder.service
[Unit]
Description=Job Finder daemon
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/job-finder
EnvironmentFile=/path/to/job-finder/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now job-finder`. Logs land in `journalctl -u job-finder -f`; meters land in `./.data/` just like the Docker setup.
