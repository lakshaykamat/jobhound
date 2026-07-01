# Deployment

End-to-end ops guide. Primary path uses Docker + `start.sh`; a non-Docker path (Node 22+ on the host) is documented in §12.

---

## 1. Prerequisites

- Docker 24+.
- A SerpApi account ([serpapi.com](https://serpapi.com)) — free tier is 100 searches/month.
- An OpenAI account with API access.

## 2. Clone the repo and configure

```bash
git clone <this-repo> jobhound
cd jobhound

cp .env.example .env
mkdir -p .data
```

Edit `.env` and set the image tag:

```
IMAGE_TAG=jobhound:latest
```

## 3. Build the image

```bash
docker build -t jobhound:latest .
```

## 4. Write `config.json` by hand

Copy the template:

```bash
cp config.example.json config.json
```

Open it and edit two sections:

- **`cycle.queries`** — the SerpApi Google Jobs strings the server runs each cycle. Aim for 2–4 (each is one search per page). Mix role × location, including a remote variant if relevant. Example: `["senior backend engineer remote india", "senior backend engineer bengaluru"]`.
- **`profile`** — your fit profile. The scorer injects it verbatim into the LLM prompt, so be accurate and concise. `skills` and `role_titles` must be non-empty; `compensation_currency` must be set if `min_annual_salary` is. See `config.example.json` for the full schema with per-field hints.

The rest (`score_threshold`, `serpapi.*`, `openai.model`, `server.poll_interval_seconds`, …) has sane defaults — leave them unless you have a reason. The server re-reads `config.json` at the start of every cycle, so edits take effect on the next run without restart.

## 5. Smoke test with a single cycle

```bash
docker run --rm \
  -e TZ=UTC -e DATA_DIR=/app/.data \
  -v "$(pwd)/.data:/app/.data" \
  jobhound:latest node dist/cli/server.js --once
```

Expected: log lines from each stage, a `cycle complete: {...}` summary, one new line in `.data/cycles.jsonl`, and per-job lines in `.data/jobs.jsonl`.

## 6. Start the server

```bash
./start.sh
```

Then open the dashboard at **http://localhost:8787** and hit **Start** to begin the cycle loop. The server boots paused, so it won't burn SerpApi quota until you ask. Once started, it loops every `server.poll_interval_seconds` (24 hours by default), re-reading `config.json` each cycle. SIGTERM drains the in-flight cycle and exits cleanly.

## 7. Updating

When code changes:

```bash
docker build -t jobhound:latest .
./start.sh
```

When your **resume or preferences** change: edit `config.json` in place. The server picks up the new values on its next cycle.

## 8. Stopping

```bash
docker stop jobhound
```

A stopped server loses nothing — `.data/` (mounted as a volume) has every meter and event.

## 9. Quota & cost meters

Per-cycle log line (also one line in `.data/cycles.jsonl`):

```
cost meters — cycle: 2 searches / 4831 tokens / $0.0241 · month 2026-06: 47/100 searches, 112450 tokens, $0.5612
```

The server skips the SerpApi call once monthly searches hit `monthly_search_cap` (default 100). To raise the cap: upgrade SerpApi and bump the value in `config.json`.

**Where each meter lives:**

| File | Purpose |
|---|---|
| `.data/usage-YYYY-MM.json` | Month-to-date totals (searches, tokens, USD, cycles). Source of truth for cap enforcement. |
| `.data/cycles.jsonl` | One JSON object per cycle (timestamp, duration_ms, all counts, cost_usd). Tail with `tail -f` or query with `jq`. |
| `.data/jobs.jsonl` | One object per posting event (`found`, `skipped-known`, `analyzed`, `scored`, `errored`) with tokens + cost per stage. |

`.data/` is mounted from the host so contents survive container restarts. **If you delete `.data/`, the server will reset month-to-date usage to zero and ignore the cap until it accumulates again.**

**Useful queries:**

```bash
# total spend this month
jq '.cost_usd' .data/usage-$(date -u +%Y-%m).json

# top-scored jobs
jq -c 'select(.action == "scored" and .score >= 80)' .data/jobs.jsonl

# count errors today
jq -c "select(.action == \"errored\" and (.timestamp | startswith(\"$(date -u +%Y-%m-%d)\")))" .data/jobs.jsonl | wc -l
```

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Cap not enforcing / month-to-date shows zero | `.data/usage-YYYY-MM.json` is missing or was deleted. Cap will re-arm as the month accumulates. |
| `ENOENT` writing to `.data/` | The `./.data` host directory doesn't exist. `mkdir -p .data` and restart. |
| `IMAGE_TAG is not set in .env` | `.env` is missing or `IMAGE_TAG` not set. Check `.env.example`. |
| `SerpApi HTTP 401` | Wrong/expired key in `secrets.serpapi_keys`. |
| `OpenAI HTTP 401` | Wrong/expired key in `secrets.openai_key`. |
| Cycle log shows `errored: N > 0` | One or more postings hit a per-posting error; check warnings just above. The cycle continues by design. |
| `SerpApi cap reached for YYYY-MM` | Expected once monthly usage ≥ `monthly_search_cap`. Wait for month rollover, raise the cap, or upgrade your plan. |
| Server won't stop | `docker stop jobhound`. The container forwards SIGTERM; the server aborts its sleep and exits within a few seconds. |

## 11. File map

```
.
├── config.example.json       # Template — copy to config.json and hand-edit
├── config.json               # Your runtime config (gitignored)
├── .data/                    # Local meters & event logs (gitignored, RW Docker volume)
├── .env                      # IMAGE_TAG (gitignored)
├── start.sh                  # Deployment script
└── packages/server/src/
    ├── adapters/             # External I/O: llm, serpapi, tracker
    ├── cli/                  # Entrypoints: server
    ├── core/                 # Domain logic: process-cycle, analyze, score, dedup, profile
    ├── config.ts
    ├── pricing.ts
    └── types.ts
```

## 12. Running without Docker

**Prerequisites:** Node.js 22+.

```bash
git clone <this-repo> jobhound
cd jobhound

cp config.example.json config.json   # then hand-edit queries + profile
mkdir -p .data

npm install
npm start                            # server loop in the foreground
```

**For long-running operation**, wrap `npm start` in a process manager (`pm2`, `systemd`, `tmux`).

A minimal systemd unit:

```ini
# /etc/systemd/system/jobhound.service
[Unit]
Description=Jobhound server
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/jobhound
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now jobhound`. Logs land in `journalctl -u jobhound -f`; meters land in `./.data/` just like the Docker setup.
