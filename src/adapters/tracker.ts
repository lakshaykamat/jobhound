import { promises as fs } from 'fs';
import path from 'path';
import { costUsd } from '../pricing';

export interface MonthlyUsage {
  month: string;
  searches: number;
  tokens: number;
  cost_usd: number;
  cycles: number;
}

export interface CycleRecord {
  cycle_id: string;
  timestamp: string;
  duration_ms: number;
  searches_used: number;
  tokens_used: number;
  cost_usd: number;
  found: number;
  new: number;
  known: number;
  scored: number;
  filtered: number;
  inserted: number;
  updated: number;
  stale: number;
  errored: number;
}

export type JobAction =
  | 'found'
  | 'skipped-known'
  | 'analyzed'
  | 'scored'
  | 'filtered'
  | 'errored';

export interface JobEvent {
  timestamp: string;
  cycle_id: string;
  job_id: string;
  action: JobAction;
  title?: string;
  company?: string;
  via?: string;
  model?: string;
  tokens?: number;
  cost_usd?: number;
  score?: number;
  error?: string;
}

export class Tracker {
  private jobEventBuffer: JobEvent[] = [];

  constructor(private dataDir: string) {}

  async recordCycle(cycle: CycleRecord): Promise<MonthlyUsage> {
    await this.flushJobEvents();
    await this.appendJsonl('cycles.jsonl', [cycle]);
    return this.bumpMonthlyUsage(cycle);
  }

  async recordCycleFinishedAt(epochMs: number): Promise<void> {
    await this.writeJson(this.lastCycleFile(), { finished_at_ms: epochMs });
  }

  async lastCycleFinishedAt(): Promise<number | null> {
    try {
      const raw = await fs.readFile(this.lastCycleFile(), 'utf8');
      const parsed = JSON.parse(raw) as { finished_at_ms?: unknown };
      return typeof parsed.finished_at_ms === 'number' && Number.isFinite(parsed.finished_at_ms)
        ? parsed.finished_at_ms
        : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private lastCycleFile(): string {
    return path.join(this.dataDir, 'last-cycle.json');
  }

  // Buffered: events are written to disk when flushJobEvents() runs (called
  // automatically by recordCycle at end of cycle). Crash mid-cycle loses these
  // events, but the sheet upsert is also at end of cycle so the cycle is
  // wholly lost — observability matches state.
  recordJobEvent(event: JobEvent): void {
    this.jobEventBuffer.push(event);
  }

  async flushJobEvents(): Promise<void> {
    if (this.jobEventBuffer.length === 0) return;
    const batch = this.jobEventBuffer;
    this.jobEventBuffer = [];
    await this.appendJsonl('jobs.jsonl', batch);
  }

  async monthlyUsage(month = currentMonth()): Promise<MonthlyUsage> {
    const file = this.usageFile(month);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<MonthlyUsage>;
      return {
        month,
        searches: numberOr(parsed.searches, 0),
        tokens: numberOr(parsed.tokens, 0),
        cost_usd: numberOr(parsed.cost_usd, 0),
        cycles: numberOr(parsed.cycles, 0),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { month, searches: 0, tokens: 0, cost_usd: 0, cycles: 0 };
      }
      throw err;
    }
  }

  private async bumpMonthlyUsage(cycle: CycleRecord): Promise<MonthlyUsage> {
    const month = monthKeyFromIso(cycle.timestamp);
    const current = await this.monthlyUsage(month);
    const next: MonthlyUsage = {
      month,
      searches: current.searches + cycle.searches_used,
      tokens: current.tokens + cycle.tokens_used,
      cost_usd: round(current.cost_usd + cycle.cost_usd, 6),
      cycles: current.cycles + 1,
    };
    await this.writeJson(this.usageFile(month), next);
    return next;
  }

  private async appendJsonl(name: string, payloads: unknown[]): Promise<void> {
    if (payloads.length === 0) return;
    await fs.mkdir(this.dataDir, { recursive: true });
    const body = payloads.map((p) => JSON.stringify(p)).join('\n') + '\n';
    await fs.appendFile(path.join(this.dataDir, name), body, 'utf8');
  }

  private async writeJson(file: string, payload: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }

  private usageFile(month: string): string {
    return path.join(this.dataDir, `usage-${month}.json`);
  }
}

export function makeCycleRecord(
  cycleId: string,
  startedAt: number,
  model: string,
  summary: {
    searchesUsed: number;
    llmTokens: number;
    found: number;
    new: number;
    known: number;
    scored: number;
    filtered: number;
    inserted: number;
    updated: number;
    stale: number;
    errored: number;
  },
): CycleRecord {
  return {
    cycle_id: cycleId,
    timestamp: new Date(startedAt).toISOString(),
    duration_ms: Date.now() - startedAt,
    searches_used: summary.searchesUsed,
    tokens_used: summary.llmTokens,
    cost_usd: round(costUsd(model, summary.llmTokens), 6),
    found: summary.found,
    new: summary.new,
    known: summary.known,
    scored: summary.scored,
    filtered: summary.filtered,
    inserted: summary.inserted,
    updated: summary.updated,
    stale: summary.stale,
    errored: summary.errored,
  };
}

export function newCycleId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}`;
}

function currentMonth(): string {
  return monthKeyFromIso(new Date().toISOString());
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
