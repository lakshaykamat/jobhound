# Jobhound

Local HTTP server with a Tailwind dashboard at `http://localhost:8787`. Boots paused; the UI exposes Start / Stop / Run-once controls and streams live cycle + job events via SSE. A cycle: discover jobs (SerpApi Google Jobs) → analyze → score against resume profile → upsert to the local jobs store. Cost & usage tracking is local. Full spec in `docs/prd.md`.

## Hard constraints

- **All data lives in `.data/`.** `jobs.json` is the jobs database (full `JobRecord` rows — read whole, atomic `.tmp + rename` writes). `cycles.jsonl` (one line per cycle), `jobs.jsonl` (one line per find/analyze/score/error event), `usage-YYYY-MM.json` (running SerpApi/token/USD totals for the month — drives cap enforcement), `last-cycle.json` (epoch ms of the last cycle attempt). No external persistence (no Google Sheet, Redis, SQLite). If `.data/` is wiped, the server forgets every job, month-to-date usage, and the last-cycle timestamp. Mount `./packages/server/.data:/app/.data` in docker-compose so data survives container restarts.
- **`process_cycle` reads `jobs.json` → does work → writes `jobs.json` + appends to event/cycle JSONL.** Crash-safe via append-only writes for events; jobs file is rewritten atomically.
- **Idempotent via `job_id`** = hash(`normalized_title + company + via`). Upsert, never duplicate.
- **Dedup before LLM.** Known `job_id` skips Analyze/Score, just bumps `last_seen` and emits a `skipped-known` event.
- **API-only discovery.** No logged-in scraping.
- **Per-posting try/catch.** One bad posting never aborts a cycle; the failure becomes an `errored` event in `jobs.jsonl`.
- **Log all three cost meters per cycle:** SerpApi searches (cap 100/mo free tier), LLM tokens, USD cost. Per-cycle line goes to stdout and `.data/cycles.jsonl`; month-to-date rollup lives in `.data/usage-YYYY-MM.json`.
- **Model prices are hardcoded** in `src/pricing.ts`. Update when OpenAI changes prices.
- **Config re-read each cycle.**

## Coding principles

Write simple, readable code prioritizing clarity over cleverness with self-explanatory names and single-responsibility functions. Don't over-engineer or build for future requirements. Keep business logic lean, extract utilities only for reused operations, and centralize types — never scatter them. Use language-native conventions, create abstractions only when needed, avoid circular dependencies, handle errors idiomatically, and log meaningfully. Let code be self-documenting — if it needs a comment explaining what it does, rewrite it instead.

## Open questions (PRD §11)

Cross-source dedup rule · hosting target · scorer calibration. Flag, don't silently resolve.

(Resolved: **write-once row semantics**. The server writes a row when it first sees + scores a posting. After that it never touches the row — no `last_seen` bumps, no staleness sweep, no status mutation. Known `job_id`s are read for dedup only; the user owns the row state from then on.)

(Resolved: **server starts paused**. `src/cli/server.ts` boots the HTTP listener but does NOT auto-start the cycle loop. The UI POSTs `/api/start`, `/api/stop`, `/api/run-once`. SSE on `/api/events` broadcasts `state`, `cycle:start`, `cycle:finish`, `cycle:error`, `job`, and `usage` events. The UI lives in `web/` as a single Tailwind-CDN HTML page + `app.js` — no build step.)
