import { CycleRecord, JobEvent, MonthlyUsage, Tracker } from '../adapters/tracker';
import { EventBus } from './event-bus';

export class ObservableTracker extends Tracker {
  constructor(dataDir: string, private bus: EventBus) {
    super(dataDir);
  }

  recordJobEvent(event: JobEvent): void {
    super.recordJobEvent(event);
    this.bus.emit({ type: 'job', payload: event });
  }

  async recordCycle(cycle: CycleRecord): Promise<MonthlyUsage> {
    const usage = await super.recordCycle(cycle);
    this.bus.emit({ type: 'cycle:finish', payload: cycle });
    this.bus.emit({ type: 'usage', payload: usage });
    return usage;
  }
}
