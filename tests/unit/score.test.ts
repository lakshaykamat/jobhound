import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreJob } from '../../src/core/score';
import { makeConfig, makeProfile, makeRecord } from '../_helpers/factories';

vi.mock('../../src/adapters/llm', () => ({
  chat: vi.fn(),
}));

import { chat } from '../../src/adapters/llm';

const mockChat = vi.mocked(chat);

function llmJson(obj: unknown, tokens = 123) {
  mockChat.mockResolvedValueOnce({ text: JSON.stringify(obj), tokens });
}

describe('scoreJob', () => {
  const cfg = makeConfig();
  const profile = makeProfile();
  const apiKey = 'sk-test';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T00:00:00.000Z'));
    mockChat.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('produces a weighted final score and propagates rationale + tokens', async () => {
    llmJson({
      axes: {
        skills_match: { score: 90, note: 'overlap on node/ts' },
        seniority_match: { score: 80, note: 'mid-level' },
        location_match: { score: 100, note: 'remote in IN' },
        comp_match: { score: 70, note: 'unpublished' },
        domain_match: { score: 75, note: 'saas adjacency' },
      },
      confidence: 'high',
      deal_breakers: [],
      rationale: 'strong match on stack and seniority',
    }, 200);

    const record = makeRecord({ posted_date: '2026-06-09' });
    const res = await scoreJob(record, 'desc', profile, apiKey, cfg.openai, cfg.scoring);

    expect(res.tokens).toBe(200);
    expect(res.rationale).toMatch(/strong match/);
    expect(res.breakdown.confidence).toBe('high');
    expect(res.breakdown.axes.recency.score).toBe(100); // 1d old, within full window
    expect(res.score).toBeGreaterThan(70);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('caps the final score when deal breakers are present', async () => {
    llmJson({
      axes: {
        skills_match: { score: 100, note: 'x' },
        seniority_match: { score: 100, note: 'x' },
        location_match: { score: 100, note: 'x' },
        comp_match: { score: 100, note: 'x' },
        domain_match: { score: 100, note: 'x' },
      },
      confidence: 'high',
      deal_breakers: ['visa sponsorship not offered'],
      rationale: 'good but blocked',
    });

    const res = await scoreJob(
      makeRecord({ posted_date: '2026-06-09' }),
      'desc',
      profile,
      apiKey,
      cfg.openai,
      cfg.scoring,
    );
    expect(res.score).toBeLessThanOrEqual(cfg.scoring.dealbreaker_score_cap);
  });

  it('clamps each axis score to [0, 100]', async () => {
    llmJson({
      axes: {
        skills_match: { score: 500, note: 'x' },
        seniority_match: { score: -50, note: 'x' },
        location_match: { score: 50, note: 'x' },
        comp_match: { score: 50, note: 'x' },
        domain_match: { score: 50, note: 'x' },
      },
      confidence: 'medium',
      deal_breakers: [],
      rationale: 'mixed',
    });
    const res = await scoreJob(
      makeRecord({ posted_date: '2026-06-09' }),
      'desc',
      profile,
      apiKey,
      cfg.openai,
      cfg.scoring,
    );
    expect(res.breakdown.axes.skills_match.score).toBe(100);
    expect(res.breakdown.axes.seniority_match.score).toBe(0);
  });

  it('throws when the JSON is missing required fields', async () => {
    llmJson({ axes: {}, rationale: 'x' });
    await expect(
      scoreJob(makeRecord(), 'd', profile, apiKey, cfg.openai, cfg.scoring),
    ).rejects.toThrow(/skills_match/);
  });

  it('throws when no JSON is found', async () => {
    mockChat.mockResolvedValueOnce({ text: 'no json here', tokens: 0 });
    await expect(
      scoreJob(makeRecord(), 'd', profile, apiKey, cfg.openai, cfg.scoring),
    ).rejects.toThrow(/no JSON/);
  });

  it('defaults confidence to medium when invalid', async () => {
    llmJson({
      axes: {
        skills_match: { score: 50, note: 'x' },
        seniority_match: { score: 50, note: 'x' },
        location_match: { score: 50, note: 'x' },
        comp_match: { score: 50, note: 'x' },
        domain_match: { score: 50, note: 'x' },
      },
      confidence: 'super-duper',
      deal_breakers: [],
      rationale: 'ok',
    });
    const res = await scoreJob(
      makeRecord({ posted_date: '2026-06-09' }),
      'd',
      profile,
      apiKey,
      cfg.openai,
      cfg.scoring,
    );
    expect(res.breakdown.confidence).toBe('medium');
  });

  it('recency=0 when posted_date is null', async () => {
    llmJson({
      axes: {
        skills_match: { score: 100, note: 'x' },
        seniority_match: { score: 100, note: 'x' },
        location_match: { score: 100, note: 'x' },
        comp_match: { score: 100, note: 'x' },
        domain_match: { score: 100, note: 'x' },
      },
      confidence: 'high',
      deal_breakers: [],
      rationale: 'x',
    });
    const res = await scoreJob(
      makeRecord({ posted_date: null }),
      'd',
      profile,
      apiKey,
      cfg.openai,
      cfg.scoring,
    );
    expect(res.breakdown.axes.recency.score).toBe(0);
  });

  it('recency decays linearly between full and decay windows', async () => {
    llmJson({
      axes: {
        skills_match: { score: 0, note: 'x' },
        seniority_match: { score: 0, note: 'x' },
        location_match: { score: 0, note: 'x' },
        comp_match: { score: 0, note: 'x' },
        domain_match: { score: 0, note: 'x' },
      },
      confidence: 'medium',
      deal_breakers: [],
      rationale: 'r',
    });
    // 30 days old: full=7, decay=60 → score ≈ 100 * (1 - 23/53) ≈ 57
    const record = makeRecord({ posted_date: '2026-05-11' });
    const res = await scoreJob(record, 'd', profile, 'k', cfg.openai, cfg.scoring);
    expect(res.breakdown.axes.recency.score).toBeGreaterThan(40);
    expect(res.breakdown.axes.recency.score).toBeLessThan(70);
  });

  it('filters out empty/non-string deal_breakers and trims them', async () => {
    llmJson({
      axes: {
        skills_match: { score: 100, note: 'x' },
        seniority_match: { score: 100, note: 'x' },
        location_match: { score: 100, note: 'x' },
        comp_match: { score: 100, note: 'x' },
        domain_match: { score: 100, note: 'x' },
      },
      confidence: 'high',
      deal_breakers: ['  visa needed  ', '', 42, '   '],
      rationale: 'r',
    });
    const res = await scoreJob(
      makeRecord({ posted_date: '2026-06-09' }),
      'd',
      profile,
      'k',
      cfg.openai,
      cfg.scoring,
    );
    expect(res.breakdown.deal_breakers).toEqual(['visa needed']);
  });
});
