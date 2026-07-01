import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { processCycle } from '../../src/core/process-cycle';
import { JobsStore } from '../../src/adapters/jobs-store';
import { Tracker } from '../../src/adapters/tracker';
import { JobRecord } from '../../src/types';
import { makeConfig } from '../_helpers/factories';
import { computeJobId } from '../../src/core/dedup';

vi.mock('../../src/adapters/serpapi', () => ({
  findJobs: vi.fn(),
}));
vi.mock('../../src/adapters/llm', () => ({
  chat: vi.fn(),
}));

import { findJobs } from '../../src/adapters/serpapi';
import { chat } from '../../src/adapters/llm';

const mockFindJobs = vi.mocked(findJobs);
const mockChat = vi.mocked(chat);

function makeFakeStore(existing: JobRecord[] = []) {
  const written: JobRecord[] = [];
  const store = {
    readAll: vi.fn().mockResolvedValue(existing),
    upsertBatch: vi.fn(async (records: JobRecord[]) => {
      written.push(...records);
      return { inserted: records.length, updated: 0 };
    }),
  } as unknown as JobsStore;
  return { store, written };
}

function rawPosting(over: Partial<{ title: string; company: string; via: string; description: string; posted_at: string | null }> = {}) {
  return {
    title: over.title ?? 'Senior Backend Engineer',
    company: over.company ?? 'Acme',
    location: 'Remote',
    via: over.via ?? 'LinkedIn',
    apply_link: 'https://apply',
    description: over.description ?? 'Remote senior role. 5+ years required.',
    salary: '20 LPA',
    schedule: null,
    posted_at: over.posted_at ?? '2 days ago',
  };
}

function scoreResponse(score: number) {
  return {
    text: JSON.stringify({
      axes: {
        skills_match: { score, note: 's' },
        seniority_match: { score, note: 's' },
        location_match: { score, note: 's' },
        comp_match: { score, note: 's' },
        domain_match: { score, note: 's' },
      },
      confidence: 'high',
      deal_breakers: [],
      rationale: 'r',
    }),
    tokens: 200,
  };
}

describe('processCycle', () => {
  let tmp: string;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
    mockFindJobs.mockReset();
    mockChat.mockReset();
    tmp = mkdtempSync(path.join(tmpdir(), 'jf-cycle-'));
  });
  afterEach(() => vi.useRealTimers());

  it('end-to-end: fresh postings get analyzed, scored, and upserted', async () => {
    const p1 = rawPosting({ title: 'Senior Backend Engineer', company: 'Acme' });
    const p2 = rawPosting({ title: 'Senior Backend Engineer', company: 'Beta' });
    mockFindJobs.mockResolvedValueOnce({
      postings: [p1, p2],
      searchesUsed: 1,
      filteredByPlatform: 0,
      queriesFailed: 0,
      quotaExhausted: false,
    });
    // Heuristics catch "senior" + "remote" so analyze does NOT call chat.
    // Each posting only triggers one chat call (score).
    mockChat.mockResolvedValueOnce(scoreResponse(90));
    mockChat.mockResolvedValueOnce(scoreResponse(50));

    const cfg = makeConfig({ openai: { llm_concurrency: 1, model: 'gpt-4o-mini' } });
    const { store, written } = makeFakeStore([]);
    const tracker = new Tracker(tmp);

    const summary = await processCycle(
      cfg,
      store,
      { serpapi: ['k'], openai: 'k' },
      tracker,
      'cycle-1',
    );

    expect(summary.found).toBe(2);
    expect(summary.new).toBe(2);
    expect(summary.scored).toBe(1);
    expect(summary.filtered).toBe(1);
    expect(summary.errored).toBe(0);
    expect(summary.searchesUsed).toBe(1);
    expect(summary.inserted).toBe(2);
    expect(summary.llmTokens).toBe(400);

    expect(written).toHaveLength(2);
    const filtered = written.find((r) => r.status === 'filtered');
    expect(filtered?.score).toBeLessThan(cfg.cycle.score_threshold);
    const passed = written.find((r) => r.status === 'new');
    expect(passed?.score).toBeGreaterThanOrEqual(cfg.cycle.score_threshold);
  });

  it('skips known postings without invoking the LLM', async () => {
    const posting = rawPosting({ title: 'Senior Backend Engineer', company: 'Known' });
    const knownId = computeJobId(posting, 'title_company_via');

    mockFindJobs.mockResolvedValueOnce({
      postings: [posting],
      searchesUsed: 1,
      filteredByPlatform: 0,
      queriesFailed: 0,
      quotaExhausted: false,
    });

    const existing: JobRecord[] = [
      {
        job_id: knownId,
        title: posting.title, company: posting.company, location: 'Remote',
        work_mode: 'remote', salary_min: null, salary_max: null, seniority: 'senior',
        source: posting.via, apply_url: '', posted_date: '2026-06-03',
        score: 80, rationale: 'r', breakdown: null, status: 'new',
        first_seen: 't', last_seen: 't',
      },
    ];
    const { store } = makeFakeStore(existing);
    const tracker = new Tracker(tmp);

    const summary = await processCycle(
      makeConfig(),
      store,
      { serpapi: ['k'], openai: 'k' },
      tracker,
      'cycle-2',
    );

    expect(summary.known).toBe(1);
    expect(summary.new).toBe(0);
    expect(summary.scored).toBe(0);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('age-filters fresh postings older than max_job_age_days', async () => {
    const young = rawPosting({ title: 'Senior Backend Engineer', company: 'Young', posted_at: '1 day ago' });
    const old = rawPosting({ title: 'Senior Backend Engineer', company: 'Old', posted_at: '60 days ago' });

    mockFindJobs.mockResolvedValueOnce({
      postings: [young, old],
      searchesUsed: 1,
      filteredByPlatform: 0,
      queriesFailed: 0,
      quotaExhausted: false,
    });
    mockChat.mockResolvedValueOnce(scoreResponse(80));

    const { store, written } = makeFakeStore([]);
    const summary = await processCycle(
      makeConfig({ cycle: { max_job_age_days: 7 } }),
      store,
      { serpapi: ['k'], openai: 'k' },
      new Tracker(tmp),
      'cycle-3',
    );

    expect(summary.found).toBe(2);
    expect(summary.new).toBe(2);
    expect(summary.scored).toBe(1);
    expect(written).toHaveLength(1);
    expect(written[0].company).toBe('Young');
  });

  it('survives a scoring failure with a per-posting try/catch (errored event)', async () => {
    const posting = rawPosting({ title: 'Senior Backend Engineer', company: 'Boom' });
    mockFindJobs.mockResolvedValueOnce({
      postings: [posting],
      searchesUsed: 1,
      filteredByPlatform: 0,
      queriesFailed: 0,
      quotaExhausted: false,
    });
    // analyze heuristics catch senior+remote → no LLM call from analyze.
    // The single chat call is the scorer, and we fail it.
    mockChat.mockRejectedValueOnce(new Error('scorer offline'));

    const { store, written } = makeFakeStore([]);
    const summary = await processCycle(
      makeConfig({ openai: { llm_concurrency: 1, model: 'gpt-4o-mini' } }),
      store,
      { serpapi: ['k'], openai: 'k' },
      new Tracker(tmp),
      'cycle-4',
    );

    expect(summary.errored).toBe(1);
    expect(summary.scored).toBe(0);
    expect(written).toHaveLength(1);
    expect(written[0].rationale).toMatch(/^errored:/);
  });

  it('writes nothing when discovery returns zero postings', async () => {
    mockFindJobs.mockResolvedValueOnce({
      postings: [],
      searchesUsed: 0,
      filteredByPlatform: 0,
      queriesFailed: 0,
      quotaExhausted: false,
    });
    const { store, written } = makeFakeStore([]);
    const summary = await processCycle(
      makeConfig(),
      store,
      { serpapi: ['k'], openai: 'k' },
      new Tracker(tmp),
      'cycle-5',
    );
    expect(summary.found).toBe(0);
    expect(summary.scored).toBe(0);
    expect(written).toHaveLength(0);
    expect(store.upsertBatch).toHaveBeenCalledWith([]);
  });

  it('processes multiple postings concurrently up to the configured limit', async () => {
    const postings = Array.from({ length: 4 }, (_, i) =>
      rawPosting({ title: 'Senior Backend Engineer', company: `Co${i}` }),
    );
    mockFindJobs.mockResolvedValueOnce({
      postings,
      searchesUsed: 1,
      filteredByPlatform: 0,
      queriesFailed: 0,
      quotaExhausted: false,
    });
    // Track simultaneous in-flight chat calls.
    let inFlight = 0;
    let peak = 0;
    mockChat.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return scoreResponse(80);
    });

    const cfg = makeConfig({ openai: { llm_concurrency: 2, model: 'gpt-4o-mini' } });
    const { store, written } = makeFakeStore([]);
    const promise = processCycle(
      cfg, store, { serpapi: ['k'], openai: 'k' }, new Tracker(tmp), 'cycle-6',
    );
    await vi.runAllTimersAsync();
    const summary = await promise;

    expect(summary.scored).toBe(4);
    expect(written).toHaveLength(4);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });
});
