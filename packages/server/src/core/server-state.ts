import { loadConfig } from '../config';
import { logger } from '../logger';
import { JobsStore } from '../adapters/jobs-store';
import { CycleRecord, makeCycleRecord, newCycleId } from '../adapters/tracker';
import { processCycle, Secrets } from './process-cycle';
import { EventBus, ServerStateSnapshot, ServerStatus } from './event-bus';
import { ObservableTracker } from './observable-tracker';

export interface ServerDeps {
  configPath: string;
  store: JobsStore;
  tracker: ObservableTracker;
  bus: EventBus;
}

interface InternalState {
  status: ServerStatus;
  currentCycleId: string | null;
  currentCycleStartedAt: number | null;
  nextCycleAt: number | null;
  lastCycle: CycleRecord | null;
}

// Server controller. Boots paused. start() flips into a perpetual loop
// (cycle → sleep → cycle …). stop() drains the in-flight cycle then
// parks back in 'paused'. runOnce() executes one cycle on demand from
// either 'paused' or 'idle'.
export class ServerController {
  private state: InternalState = {
    status: 'paused',
    currentCycleId: null,
    currentCycleStartedAt: null,
    nextCycleAt: null,
    lastCycle: null,
  };
  private loopAbort: AbortController | null = null;
  private sleepCancel: (() => void) | null = null;
  private onceInFlight: Promise<void> | null = null;

  constructor(private deps: ServerDeps) {}

  monthlyUsage() {
    return this.deps.tracker.monthlyUsage();
  }

  loadConfigSafe() {
    return safeLoad(this.deps.configPath);
  }

  loadConfigOrThrow() {
    return loadConfig(this.deps.configPath);
  }

  snapshot(): ServerStateSnapshot {
    const cfg = safeLoad(this.deps.configPath);
    return {
      status: this.state.status,
      current_cycle_id: this.state.currentCycleId,
      current_cycle_started_at: this.state.currentCycleStartedAt
        ? new Date(this.state.currentCycleStartedAt).toISOString()
        : null,
      next_cycle_at: this.state.nextCycleAt
        ? new Date(this.state.nextCycleAt).toISOString()
        : null,
      config_summary: cfg
        ? {
            queries: cfg.cycle.queries.length,
            model: cfg.openai.model,
            llm_concurrency: cfg.openai.llm_concurrency,
            poll_interval_seconds: cfg.server.poll_interval_seconds,
            score_threshold: cfg.cycle.score_threshold,
            dedup_strategy: cfg.cycle.dedup_strategy,
          }
        : null,
      features: cfg ? { tailor_resume: cfg.features.tailor_resume } : null,
      month_usage: null, // filled in by HTTP layer (async)
      last_cycle: this.state.lastCycle,
    };
  }

  status(): ServerStatus {
    return this.state.status;
  }

  start(): { ok: boolean; reason?: string } {
    if (this.state.status !== 'paused') {
      return { ok: false, reason: `cannot start from status="${this.state.status}"` };
    }
    this.setStatus('idle');
    this.loopAbort = new AbortController();
    this.runLoop(this.loopAbort.signal).catch((err) => {
      logger.error('server loop crashed', { err });
      this.setStatus('paused');
    });
    return { ok: true };
  }

  stop(): { ok: boolean; reason?: string } {
    if (this.state.status === 'paused') {
      return { ok: false, reason: 'already paused' };
    }
    if (this.state.status === 'stopping') {
      return { ok: false, reason: 'already stopping' };
    }
    this.setStatus('stopping');
    this.loopAbort?.abort();
    this.sleepCancel?.();
    return { ok: true };
  }

  async runOnce(): Promise<{ ok: boolean; reason?: string }> {
    if (this.state.status === 'running' || this.onceInFlight) {
      return { ok: false, reason: 'a cycle is already running' };
    }
    if (this.state.status !== 'paused' && this.state.status !== 'idle') {
      return { ok: false, reason: `cannot run-once from status="${this.state.status}"` };
    }
    const wasPaused = this.state.status === 'paused';
    const previousNext = this.state.nextCycleAt;
    this.onceInFlight = (async () => {
      try {
        await this.runOneCycle();
      } finally {
        this.onceInFlight = null;
        if (wasPaused) {
          this.setStatus('paused');
        } else {
          this.state.nextCycleAt = previousNext;
          this.setStatus('idle');
        }
      }
    })();
    return { ok: true };
  }

  // For graceful process shutdown: stop loop, drain any in-flight cycle.
  async drain(): Promise<void> {
    this.loopAbort?.abort();
    this.sleepCancel?.();
    if (this.onceInFlight) {
      await this.onceInFlight.catch(() => undefined);
    }
    // give the loop a microtask to settle into paused
    await new Promise<void>((r) => setImmediate(r));
  }

  private async runLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let pollSeconds: number;
      try {
        await this.runOneCycle();
        pollSeconds = safeLoad(this.deps.configPath)?.server.poll_interval_seconds ?? 3600;
      } catch (err) {
        logger.error('cycle failed inside loop', { err });
        pollSeconds = safeLoad(this.deps.configPath)?.server.poll_interval_seconds ?? 3600;
      }
      if (signal.aborted) break;
      this.state.nextCycleAt = Date.now() + pollSeconds * 1000;
      this.setStatus('idle');
      logger.info('sleeping until next cycle', { seconds: pollSeconds });
      await sleep(pollSeconds * 1000, signal, (cancel) => {
        this.sleepCancel = cancel;
      });
      this.sleepCancel = null;
    }
    this.state.nextCycleAt = null;
    this.setStatus('paused');
    logger.info('server loop stopped');
  }

  private async runOneCycle(): Promise<void> {
    const config = loadConfig(this.deps.configPath);
    const secrets: Secrets = {
      serpapi: config.secrets.serpapi_keys,
      openai: config.secrets.openai_key,
    };
    const usage = await this.deps.tracker.monthlyUsage();

    const cycleId = newCycleId();
    const cycleLog = logger.child({ cycle_id: cycleId });
    const startedAt = Date.now();

    this.state.currentCycleId = cycleId;
    this.state.currentCycleStartedAt = startedAt;
    this.setStatus('running');

    this.deps.bus.emit({
      type: 'cycle:start',
      payload: {
        cycle_id: cycleId,
        started_at: new Date(startedAt).toISOString(),
        queries: config.cycle.queries.length,
        model: config.openai.model,
      },
    });

    cycleLog.info('cycle starting', {
      queries: config.cycle.queries.length,
      max_pages_per_query: config.cycle.max_pages_per_query,
      score_threshold: config.cycle.score_threshold,
      dedup_strategy: config.cycle.dedup_strategy,
      model: config.openai.model,
      llm_concurrency: config.openai.llm_concurrency,
      month_searches_used: usage.searches,
    });

    let record: CycleRecord | null = null;
    try {
      const summary = await processCycle(
        config,
        this.deps.store,
        secrets,
        this.deps.tracker,
        cycleId,
        cycleLog,
      );
      record = makeCycleRecord(cycleId, startedAt, config.openai.model, summary);
      const after = await this.deps.tracker.recordCycle(record);
      this.state.lastCycle = record;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cycleLog.error('cycle failed', { err });
      this.deps.bus.emit({ type: 'cycle:error', payload: { cycle_id: cycleId, error: message } });
      throw err;
    } finally {
      try {
        await this.deps.tracker.flushJobEvents();
      } catch (flushErr) {
        logger.warn('failed to flush job events', { err: flushErr });
      }
      try {
        await this.deps.tracker.recordCycleFinishedAt(Date.now());
      } catch (writeErr) {
        logger.warn('failed to persist last-cycle timestamp', { err: writeErr });
      }
      this.state.currentCycleId = null;
      this.state.currentCycleStartedAt = null;
    }
  }

  private setStatus(next: ServerStatus): void {
    if (this.state.status === next) return;
    this.state.status = next;
    this.deps.bus.emit({ type: 'state', payload: this.snapshot() });
  }
}

function safeLoad(path: string) {
  try {
    return loadConfig(path);
  } catch {
    return null;
  }
}

function sleep(
  ms: number,
  signal: AbortSignal,
  registerCancel: (cancel: () => void) => void,
): Promise<void> {
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
    registerCancel(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
