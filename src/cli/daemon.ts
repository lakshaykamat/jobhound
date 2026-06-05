import 'dotenv/config';
import { loadConfig } from '../config';
import { SHUTDOWN_SIGNALS } from '../constants';
import { JobsSheet } from '../adapters/sheets';
import { Tracker, makeCycleRecord, newCycleId } from '../adapters/tracker';
import { processCycle, Secrets } from '../core/process-cycle';
import { logger } from '../logger';
import { StartupValidationError, validateStartup } from './startup';

const DEFAULT_DATA_DIR = './.data';

const USAGE = 'usage: daemon <config.json path> [--once]';

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const configPath = args.find((a) => !a.startsWith('--'));
  if (!configPath) {
    logger.error('config path is required; pass it as a positional argument', { usage: USAGE });
    process.exit(1);
  }
  const dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR;

  logger.info('daemon starting', {
    mode: once ? 'once' : 'loop',
    config_path: configPath,
    data_dir: dataDir,
    node: process.version,
    pid: process.pid,
    log_level: process.env.LOG_LEVEL ?? 'info',
    log_format: process.env.LOG_FORMAT ?? (process.stdout.isTTY ? 'pretty' : 'json'),
  });

  const { env } = validateStartup({ configPath, dataDir });
  const sheet = new JobsSheet(env.APPS_SCRIPT_URL, env.APPS_SCRIPT_TOKEN);
  const tracker = new Tracker(dataDir);
  const secrets: Secrets = { serpapi: env.SERPAPI_KEY, openai: env.OPENAI_KEY };

  if (once) {
    await safeRunCycle(configPath, sheet, tracker, secrets);
    logger.info('daemon exiting after --once run');
    return;
  }

  const shutdown = installShutdownHandlers();
  const resumeSeconds = await resumeSleepSeconds(configPath, tracker);
  if (resumeSeconds > 0) {
    logger.info('resuming sleep from previous run', { seconds: resumeSeconds });
    await sleep(resumeSeconds * 1000, shutdown.signal);
  }
  while (!shutdown.requested) {
    const pollSeconds = await safeRunCycle(configPath, sheet, tracker, secrets);
    if (shutdown.requested) break;
    logger.info('sleeping until next cycle', { seconds: pollSeconds });
    await sleep(pollSeconds * 1000, shutdown.signal);
  }
  logger.info('daemon shut down cleanly');
}

async function resumeSleepSeconds(configPath: string, tracker: Tracker): Promise<number> {
  const last = await tracker.lastCycleFinishedAt();
  if (last === null) return 0;
  const pollSeconds = loadConfig(configPath).daemon.poll_interval_seconds;
  const elapsed = Math.floor((Date.now() - last) / 1000);
  return Math.max(0, pollSeconds - elapsed);
}

async function safeRunCycle(
  configPath: string,
  sheet: JobsSheet,
  tracker: Tracker,
  secrets: Secrets,
): Promise<number> {
  try {
    return await runOneCycle(configPath, sheet, tracker, secrets);
  } catch (err) {
    logger.error('cycle failed', { err });
    try {
      return loadConfig(configPath).daemon.poll_interval_seconds;
    } catch (cfgErr) {
      logger.error('config reload failed; falling back to 1h sleep', { err: cfgErr });
      return 3600;
    }
  } finally {
    try {
      await tracker.flushJobEvents();
    } catch (flushErr) {
      logger.warn('failed to flush job events', { err: flushErr });
    }
    try {
      await tracker.recordCycleFinishedAt(Date.now());
    } catch (writeErr) {
      logger.warn('failed to persist last-cycle timestamp', { err: writeErr });
    }
  }
}

async function runOneCycle(
  configPath: string,
  sheet: JobsSheet,
  tracker: Tracker,
  secrets: Secrets,
): Promise<number> {
  const config = loadConfig(configPath);
  const { daemon } = config;
  const usage = await tracker.monthlyUsage();

  const cycleId = newCycleId();
  const cycleLog = logger.child({ cycle_id: cycleId });
  const startedAt = Date.now();

  cycleLog.info('cycle starting', {
    queries: config.cycle.queries.length,
    max_pages_per_query: config.cycle.max_pages_per_query,
    score_threshold: config.cycle.score_threshold,
    dedup_strategy: config.cycle.dedup_strategy,
    model: config.openai.model,
    llm_concurrency: config.openai.llm_concurrency,
    month_searches_used: usage.searches,
  });

  const summary = await processCycle(config, sheet, secrets, tracker, cycleId, cycleLog);
  const record = makeCycleRecord(cycleId, startedAt, config.openai.model, summary);
  const after = await tracker.recordCycle(record);

  cycleLog.info('cycle finished', {
    duration_ms: record.duration_ms,
    searches_used: record.searches_used,
    tokens_used: record.tokens_used,
    cost_usd: round(record.cost_usd, 6),
    found: summary.found,
    new: summary.new,
    known: summary.known,
    scored: summary.scored,
    filtered: summary.filtered,
    inserted: summary.inserted,
    updated: summary.updated,
    errored: summary.errored,
    month: after.month,
    month_searches: after.searches,
    month_tokens: after.tokens,
    month_cost_usd: round(after.cost_usd, 6),
  });

  return daemon.poll_interval_seconds;
}

interface Shutdown {
  requested: boolean;
  signal: AbortSignal;
}

function installShutdownHandlers(): Shutdown {
  const controller = new AbortController();
  const state: Shutdown = { requested: false, signal: controller.signal };
  for (const sig of SHUTDOWN_SIGNALS) {
    process.on(sig, () => {
      if (state.requested) return;
      state.requested = true;
      logger.info('shutdown signal received; draining current work', { signal: sig });
      controller.abort();
    });
  }
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException; exiting', { err });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection; exiting', { err: reason });
    process.exit(1);
  });
  return state;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

main().catch((err) => {
  if (err instanceof StartupValidationError) {
    logger.error('startup aborted; fix the issues above and retry', { issue_count: err.errors.length });
  } else {
    logger.error('fatal error in daemon main', { err });
  }
  process.exit(1);
});
