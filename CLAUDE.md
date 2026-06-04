# Job Finder

Daemon: discover jobs (SerpApi Google Jobs) → analyze → score against resume profile → upsert to Google Sheet. Cost & usage tracking is local. Full spec in `docs/prd.md`.

## Hard constraints

- **Sheet is the jobs database.** Job rows only. No other state in the Sheet.
- **`.data/` is the local meters & observability store.** `cycles.jsonl` (one line per cycle), `jobs.jsonl` (one line per find/analyze/score/error event), `usage-YYYY-MM.json` (running SerpApi/token/USD totals for the month — drives cap enforcement), `last-cycle.json` (epoch ms of the last cycle attempt — restart resumes the poll cooldown from this). Append-only JSONL + per-month/single JSON. No other persistence layer (no Redis/SQLite). If `.data/` is wiped, the daemon forgets month-to-date usage (cap meter resets) and forgets the last-cycle timestamp (fires immediately on next start instead of resuming cooldown). Mount as a volume in production.
- **`process_cycle` reads Sheet → does work → writes Sheet + appends to `.data/`.** Crash-safe via append-only writes.
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

Cross-source dedup rule · hosting target · staleness K · scorer calibration. Flag, don't silently resolve.
