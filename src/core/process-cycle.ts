import { AppConfig } from '../config';
import { MS_PER_DAY } from '../constants';
import { JobRecord } from '../types';
import { JobsSheet } from '../adapters/sheets';
import { findJobs } from '../adapters/serpapi';
import { Tracker } from '../adapters/tracker';
import { costUsd } from '../pricing';
import { IdentifiedPosting, splitByKnown } from './dedup';
import { analyzePosting } from './analyze';
import { scoreJob } from './score';
import { Logger, logger as rootLogger } from '../logger';

export interface Secrets {
  serpapi: string;
  openai: string;
}

export interface CycleSummary {
  searchesUsed: number;
  found: number;
  new: number;
  known: number;
  scored: number;
  filtered: number;
  inserted: number;
  updated: number;
  stale: number;
  errored: number;
  llmTokens: number;
}

interface ProcessedPosting {
  record: JobRecord;
  tokens: number;
  belowThreshold: boolean;
  errored: boolean;
}

export async function processCycle(
  config: AppConfig,
  sheet: JobsSheet,
  secrets: Secrets,
  tracker: Tracker,
  cycleId: string,
  log: Logger = rootLogger.child({ cycle_id: cycleId }),
): Promise<CycleSummary> {
  log.debug('ensuring sheet header');
  await sheet.ensureHeader();

  log.debug('reading existing rows from sheet');
  const existing = await sheet.readAll();
  log.info('sheet read complete', { existing_rows: existing.length });

  log.info('discovery starting', {
    queries: config.cycle.queries,
    max_pages_per_query: config.cycle.max_pages_per_query,
    platforms: config.serpapi.platforms,
    max_job_age_days: config.cycle.max_job_age_days,
  });
  const find = await findJobs(
    config.cycle.queries,
    config.cycle.max_pages_per_query,
    secrets.serpapi,
    config.serpapi,
    {
      platforms: config.serpapi.platforms,
      maxAgeDays: config.cycle.max_job_age_days,
    },
    log,
  );
  log.info('discovery complete', {
    searches_used: find.searchesUsed,
    raw_postings: find.postings.length,
    dropped_by_platform: find.filteredByPlatform,
    dropped_by_age: find.filteredByAge,
  });

  const split = splitByKnown(find.postings, existing, config.cycle.dedup_strategy);
  log.info('dedup split complete', {
    fresh: split.fresh.length,
    known: split.touch.length,
    dedup_strategy: config.cycle.dedup_strategy,
  });

  emitFoundEvents(tracker, cycleId, split.fresh, log);
  emitSkippedEvents(tracker, cycleId, split.touch, log);

  const freshCapped = capFreshIntake(
    split.fresh,
    config.cycle.max_jobs_per_hour,
    config.daemon.poll_interval_seconds,
    log,
  );

  log.info('processing fresh postings', {
    count: freshCapped.length,
    llm_concurrency: config.openai.llm_concurrency,
  });
  const processed = await runWithConcurrency(freshCapped, config.openai.llm_concurrency, (item) =>
    processOnePosting(item, config, secrets, tracker, cycleId, log),
  );

  let llmTokens = 0;
  let errored = 0;
  let filtered = 0;
  const upsertRecords: JobRecord[] = [...split.touch];
  for (const p of processed) {
    llmTokens += p.tokens;
    if (p.errored) errored++;
    if (p.belowThreshold) filtered++;
    upsertRecords.push(p.record);
  }

  log.info('writing upsert batch to sheet', { records: upsertRecords.length });
  const written = await sheet.upsertBatch(upsertRecords);
  log.info('upsert complete', { inserted: written.inserted, updated: written.updated });

  const staleRows = markStale(existing, split.seenIds, config.cycle.staleness_days);
  let staleWritten = { inserted: 0, updated: 0 };
  if (staleRows.length > 0) {
    log.info('marking stale rows', { count: staleRows.length, staleness_days: config.cycle.staleness_days });
    staleWritten = await sheet.upsertBatch(staleRows);
    log.info('stale write complete', { updated: staleWritten.updated });
  } else {
    log.debug('no stale rows to mark');
  }

  return {
    searchesUsed: find.searchesUsed,
    found: find.postings.length,
    new: split.fresh.length,
    known: split.touch.length,
    scored: processed.length - errored,
    filtered,
    inserted: written.inserted + staleWritten.inserted,
    updated: written.updated + staleWritten.updated,
    stale: staleRows.length,
    errored,
    llmTokens,
  };
}

async function processOnePosting(
  { jobId, posting }: IdentifiedPosting,
  config: AppConfig,
  secrets: Secrets,
  tracker: Tracker,
  cycleId: string,
  parentLog: Logger,
): Promise<ProcessedPosting> {
  const log = parentLog.child({
    job_id: jobId,
    title: posting.title,
    company: posting.company,
    via: posting.via,
  });
  let tokens = 0;
  let analyzedRecord: JobRecord | null = null;
  const model = config.openai.model;

  log.debug('analyze starting');
  try {
    const analyzed = await analyzePosting(
      jobId,
      posting,
      secrets.openai,
      config.openai,
      config.extraction,
      log,
    );
    tokens += analyzed.tokens;
    analyzedRecord = analyzed.record;
    log.info('analyze done', {
      tokens: analyzed.tokens,
      work_mode: analyzed.record.work_mode,
      seniority: analyzed.record.seniority,
    });
    tracker.recordJobEvent({
      timestamp: new Date().toISOString(),
      cycle_id: cycleId,
      job_id: jobId,
      action: 'analyzed',
      title: posting.title,
      company: posting.company,
      via: posting.via,
      model,
      tokens: analyzed.tokens,
      cost_usd: round(costUsd(model, analyzed.tokens), 6),
    });
  } catch (err) {
    return handleFailure(jobId, posting, cycleId, tracker, err as Error, null, tokens, log);
  }

  log.debug('score starting');
  try {
    const result = await scoreJob(
      analyzedRecord,
      posting.description,
      config.profile,
      secrets.openai,
      config.openai,
      config.extraction,
      config.scoring,
      log,
    );
    tokens += result.tokens;
    const belowThreshold = result.score < config.cycle.score_threshold;

    log.info(belowThreshold ? 'job filtered (below threshold)' : 'job scored', {
      score: result.score,
      threshold: config.cycle.score_threshold,
      confidence: result.breakdown.confidence,
      deal_breakers: result.breakdown.deal_breakers.length,
      tokens: result.tokens,
    });

    tracker.recordJobEvent({
      timestamp: new Date().toISOString(),
      cycle_id: cycleId,
      job_id: jobId,
      action: belowThreshold ? 'filtered' : 'scored',
      title: posting.title,
      company: posting.company,
      via: posting.via,
      model,
      tokens: result.tokens,
      cost_usd: round(costUsd(model, result.tokens), 6),
      score: result.score,
    });

    return {
      record: {
        ...analyzedRecord,
        score: result.score,
        rationale: result.rationale,
        breakdown: JSON.stringify(result.breakdown),
        status: belowThreshold ? 'filtered' : analyzedRecord.status,
      },
      tokens,
      belowThreshold,
      errored: false,
    };
  } catch (err) {
    return handleFailure(jobId, posting, cycleId, tracker, err as Error, analyzedRecord, tokens, log);
  }
}

// On any LLM failure we still persist a row so dedup catches the job next cycle
// and we don't pay analyze tokens again. If analyze itself failed we synthesize
// a minimal record from the raw posting.
function handleFailure(
  jobId: string,
  posting: IdentifiedPosting['posting'],
  cycleId: string,
  tracker: Tracker,
  err: Error,
  analyzed: JobRecord | null,
  tokens: number,
  log: Logger,
): ProcessedPosting {
  const msg = err.message;
  log.warn('job processing failed', { stage: analyzed ? 'score' : 'analyze', err });
  tracker.recordJobEvent({
    timestamp: new Date().toISOString(),
    cycle_id: cycleId,
    job_id: jobId,
    action: 'errored',
    title: posting.title,
    company: posting.company,
    via: posting.via,
    error: msg,
  });

  const now = new Date().toISOString();
  const record: JobRecord = analyzed ?? {
    job_id: jobId,
    title: posting.title,
    company: posting.company,
    location: posting.location,
    work_mode: 'unknown',
    salary_min: null,
    salary_max: null,
    seniority: null,
    source: posting.via,
    apply_url: posting.apply_link,
    posted_date: null,
    score: 0,
    rationale: '',
    breakdown: null,
    status: 'new',
    first_seen: now,
    last_seen: now,
  };

  return {
    record: { ...record, rationale: `errored: ${msg.slice(0, 200)}`, status: 'filtered' },
    tokens,
    belowThreshold: false,
    errored: true,
  };
}

function emitFoundEvents(tracker: Tracker, cycleId: string, fresh: IdentifiedPosting[], log: Logger): void {
  const now = new Date().toISOString();
  for (const { jobId, posting } of fresh) {
    log.debug('fresh posting identified', { job_id: jobId, title: posting.title, company: posting.company });
    tracker.recordJobEvent({
      timestamp: now,
      cycle_id: cycleId,
      job_id: jobId,
      action: 'found',
      title: posting.title,
      company: posting.company,
      via: posting.via,
    });
  }
}

function emitSkippedEvents(tracker: Tracker, cycleId: string, touched: JobRecord[], log: Logger): void {
  const now = new Date().toISOString();
  for (const r of touched) {
    log.debug('known posting skipped', { job_id: r.job_id, title: r.title, company: r.company });
    tracker.recordJobEvent({
      timestamp: now,
      cycle_id: cycleId,
      job_id: r.job_id,
      action: 'skipped-known',
      title: r.title,
      company: r.company,
      via: r.source,
    });
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

function capFreshIntake(
  fresh: IdentifiedPosting[],
  maxPerHour: number,
  pollSeconds: number,
  log: Logger,
): IdentifiedPosting[] {
  const hours = Math.max(1, Math.floor(pollSeconds / 3600));
  const cap = maxPerHour * hours;
  if (fresh.length <= cap) return fresh;
  log.warn('intake cap applied', {
    fresh_before: fresh.length,
    fresh_after: cap,
    max_per_hour: maxPerHour,
    hours,
  });
  return fresh.slice(0, cap);
}

function markStale(existing: JobRecord[], seenIds: Set<string>, stalenessDays: number): JobRecord[] {
  const cutoff = Date.now() - stalenessDays * MS_PER_DAY;
  const out: JobRecord[] = [];
  for (const row of existing) {
    if (seenIds.has(row.job_id)) continue;
    if (row.status !== 'new' && row.status !== 'reviewed') continue;
    const lastSeenMs = Date.parse(row.last_seen);
    if (!Number.isFinite(lastSeenMs) || lastSeenMs >= cutoff) continue;
    out.push({ ...row, status: 'stale' });
  }
  return out;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
