import { AppConfig } from '../config';
import { JobRecord } from '../types';
import { JobsSheet } from '../adapters/sheets';
import { findJobs } from '../adapters/serpapi';
import { Tracker } from '../adapters/tracker';
import { costUsd } from '../pricing';
import { IdentifiedPosting, splitByKnown } from './dedup';
import { analyzePosting } from './analyze';
import { ageInDaysFromIso, parsePostedAt } from './posted-at';
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
    { platforms: config.serpapi.platforms },
    log,
  );
  log.info('discovery complete', {
    searches_used: find.searchesUsed,
    raw_postings: find.postings.length,
    dropped_by_platform: find.filteredByPlatform,
    queries_failed: find.queriesFailed,
    quota_exhausted: find.quotaExhausted,
  });

  const split = splitByKnown(find.postings, existing, config.cycle.dedup_strategy);
  log.info('dedup split complete', {
    fresh: split.fresh.length,
    known: split.touch.length,
    dedup_strategy: config.cycle.dedup_strategy,
  });

  // Age filter applies ONLY to fresh postings — we don't pick up a new-to-us
  // job that's already too old to be worth analyzing.
  const freshAgeFiltered = filterFreshByAge(split.fresh, config.cycle.max_job_age_days);
  if (freshAgeFiltered.dropped > 0) {
    log.info('age filter dropped fresh postings', {
      dropped: freshAgeFiltered.dropped,
      max_job_age_days: config.cycle.max_job_age_days,
    });
  }

  emitFoundEvents(tracker, cycleId, freshAgeFiltered.kept, log);
  emitSkippedEvents(tracker, cycleId, split.touch, log);

  log.info('processing fresh postings', {
    count: freshAgeFiltered.kept.length,
    llm_concurrency: config.openai.llm_concurrency,
  });
  const processed = await runWithConcurrency(
    freshAgeFiltered.kept,
    config.openai.llm_concurrency,
    (item) => processOnePosting(item, config, secrets, tracker, cycleId, log),
  );

  let llmTokens = 0;
  let errored = 0;
  let filtered = 0;
  const upsertRecords: JobRecord[] = [];
  for (const p of processed) {
    llmTokens += p.tokens;
    if (p.errored) errored++;
    if (p.belowThreshold) filtered++;
    upsertRecords.push(p.record);
  }

  log.info('writing upsert batch to sheet', { records: upsertRecords.length });
  const written = await sheet.upsertBatch(upsertRecords);
  log.info('upsert complete', { inserted: written.inserted, updated: written.updated });

  return {
    searchesUsed: find.searchesUsed,
    found: find.postings.length,
    new: split.fresh.length,
    known: split.touch.length,
    scored: processed.length - errored - filtered,
    filtered,
    inserted: written.inserted,
    updated: written.updated,
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
    record: { ...record, rationale: `errored: ${msg.slice(0, 200)}` },
    tokens,
    belowThreshold: false,
    errored: true,
  };
}

function filterFreshByAge(
  fresh: IdentifiedPosting[],
  maxAgeDays: number | null | undefined,
): { kept: IdentifiedPosting[]; dropped: number } {
  if (maxAgeDays == null) return { kept: fresh, dropped: 0 };
  const kept: IdentifiedPosting[] = [];
  let dropped = 0;
  for (const item of fresh) {
    const iso = parsePostedAt(item.posting.posted_at);
    const age = ageInDaysFromIso(iso);
    // Unknown age (null) is kept — lenient: better to score and let recency
    // weighting handle it than to silently drop fresh-looking postings.
    if (age != null && age > maxAgeDays) dropped++;
    else kept.push(item);
  }
  return { kept, dropped };
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

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
