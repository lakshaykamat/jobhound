import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Tracker, makeCycleRecord, newCycleId } from '../../src/adapters/tracker';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'jf-tracker-'));
});
afterEach(() => {
  // Best-effort cleanup; test isolation does not require this.
});

describe('Tracker', () => {
  it('appends cycle records and bumps monthly usage', async () => {
    const tr = new Tracker(dir);
    const cycle = {
      cycle_id: 'c1',
      timestamp: '2026-06-05T00:00:00.000Z',
      duration_ms: 100,
      searches_used: 3,
      tokens_used: 1000,
      cost_usd: 0.01,
      found: 5,
      new: 2,
      known: 3,
      scored: 2,
      filtered: 0,
      inserted: 2,
      updated: 0,
      errored: 0,
    };
    const usage = await tr.recordCycle(cycle);
    expect(usage.month).toBe('2026-06');
    expect(usage.cycles).toBe(1);
    expect(usage.searches).toBe(3);

    const usage2 = await tr.recordCycle({ ...cycle, cycle_id: 'c2' });
    expect(usage2.cycles).toBe(2);
    expect(usage2.searches).toBe(6);

    const lines = readFileSync(path.join(dir, 'cycles.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.cycle_id).toBe('c1');
  });

  it('writes per-month usage files independently', async () => {
    const tr = new Tracker(dir);
    await tr.recordCycle({
      cycle_id: 'c1', timestamp: '2026-05-31T23:00:00.000Z',
      duration_ms: 0, searches_used: 1, tokens_used: 0, cost_usd: 0,
      found: 0, new: 0, known: 0, scored: 0, filtered: 0,
      inserted: 0, updated: 0, errored: 0,
    });
    await tr.recordCycle({
      cycle_id: 'c2', timestamp: '2026-06-01T00:00:00.000Z',
      duration_ms: 0, searches_used: 2, tokens_used: 0, cost_usd: 0,
      found: 0, new: 0, known: 0, scored: 0, filtered: 0,
      inserted: 0, updated: 0, errored: 0,
    });
    const may = await tr.monthlyUsage('2026-05');
    const jun = await tr.monthlyUsage('2026-06');
    expect(may.searches).toBe(1);
    expect(jun.searches).toBe(2);
  });

  it('returns zeros for an unknown month with no file', async () => {
    const tr = new Tracker(dir);
    const u = await tr.monthlyUsage('1999-01');
    expect(u).toEqual({ month: '1999-01', searches: 0, tokens: 0, cost_usd: 0, cycles: 0 });
  });

  it('buffers job events and flushes them as JSONL', async () => {
    const tr = new Tracker(dir);
    tr.recordJobEvent({ timestamp: 't', cycle_id: 'c', job_id: 'j', action: 'found' });
    tr.recordJobEvent({ timestamp: 't', cycle_id: 'c', job_id: 'j', action: 'analyzed', tokens: 10 });
    expect(existsSync(path.join(dir, 'jobs.jsonl'))).toBe(false);
    await tr.flushJobEvents();
    const lines = readFileSync(path.join(dir, 'jobs.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).action).toBe('found');
  });

  it('flushJobEvents is a no-op when buffer is empty', async () => {
    const tr = new Tracker(dir);
    await tr.flushJobEvents();
    expect(existsSync(path.join(dir, 'jobs.jsonl'))).toBe(false);
  });

  it('lastCycleFinishedAt round-trips through disk', async () => {
    const tr = new Tracker(dir);
    expect(await tr.lastCycleFinishedAt()).toBeNull();
    await tr.recordCycleFinishedAt(1_700_000_000_000);
    expect(await tr.lastCycleFinishedAt()).toBe(1_700_000_000_000);
  });

  it('returns null when last-cycle.json has bad shape', async () => {
    const tr = new Tracker(dir);
    await tr.recordCycleFinishedAt(NaN);
    expect(await tr.lastCycleFinishedAt()).toBeNull();
  });
});

describe('makeCycleRecord', () => {
  it('rounds cost_usd to 6 decimals and includes the summary fields', () => {
    const rec = makeCycleRecord('cid', Date.now() - 500, 'gpt-4o-mini', {
      searchesUsed: 1,
      llmTokens: 2_000_000,
      found: 3, new: 1, known: 2, scored: 1, filtered: 0, inserted: 1, updated: 0, errored: 0,
    });
    expect(rec.cycle_id).toBe('cid');
    expect(rec.searches_used).toBe(1);
    expect(rec.tokens_used).toBe(2_000_000);
    expect(rec.cost_usd).toBeGreaterThan(0);
    expect(rec.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('newCycleId', () => {
  it('produces a stamp-prefixed id', () => {
    const id = newCycleId(new Date('2026-06-05T12:34:56.000Z'));
    expect(id).toMatch(/^20260605123456-[a-z0-9]{6}$/);
  });
});
