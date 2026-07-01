import { CycleRecord, JobEvent, MonthlyUsage } from '../adapters/tracker';

export type ServerStatus = 'paused' | 'idle' | 'running' | 'stopping';

export interface ServerStateSnapshot {
  status: ServerStatus;
  current_cycle_id: string | null;
  current_cycle_started_at: string | null;
  next_cycle_at: string | null;
  config_summary: {
    queries: number;
    model: string;
    llm_concurrency: number;
    poll_interval_seconds: number;
    score_threshold: number;
    dedup_strategy: string;
  } | null;
  features: { tailor_resume: boolean } | null;
  month_usage: MonthlyUsage | null;
  last_cycle: CycleRecord | null;
}

export type ServerEvent =
  | { type: 'state'; payload: ServerStateSnapshot }
  | { type: 'cycle:start'; payload: { cycle_id: string; started_at: string; queries: number; model: string } }
  | { type: 'cycle:finish'; payload: CycleRecord }
  | { type: 'cycle:error'; payload: { cycle_id: string; error: string } }
  | { type: 'job'; payload: JobEvent }
  | { type: 'usage'; payload: MonthlyUsage };

export type Subscriber = (event: ServerEvent) => void;

export class EventBus {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  emit(event: ServerEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        // a misbehaving subscriber must never break the cycle loop
      }
    }
  }

  size(): number {
    return this.subscribers.size;
  }
}
