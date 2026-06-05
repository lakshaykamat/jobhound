import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePosting } from '../../src/core/analyze';
import { makeConfig, makePosting } from '../_helpers/factories';

vi.mock('../../src/adapters/llm', () => ({ chat: vi.fn() }));
import { chat } from '../../src/adapters/llm';
const mockChat = vi.mocked(chat);

describe('analyzePosting', () => {
  const openai = makeConfig().openai;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
    mockChat.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('detects remote/senior from heuristics without calling the LLM', async () => {
    const posting = makePosting({
      title: 'Senior Backend Engineer',
      description: 'Fully remote role.',
    });
    const out = await analyzePosting('job1', posting, 'k', openai);
    expect(out.record.work_mode).toBe('remote');
    expect(out.record.seniority).toBe('senior');
    expect(out.tokens).toBe(0);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('falls back to the LLM only when heuristics are insufficient', async () => {
    mockChat.mockResolvedValueOnce({
      text: JSON.stringify({ work_mode: 'hybrid', seniority: 'mid' }),
      tokens: 42,
    });
    const posting = makePosting({
      title: 'Software Engineer',
      description: 'You will build APIs.',
      location: 'Bangalore',
    });
    const out = await analyzePosting('job1', posting, 'k', openai);
    expect(mockChat).toHaveBeenCalledOnce();
    expect(out.record.work_mode).toBe('hybrid');
    expect(out.record.seniority).toBe('mid');
    expect(out.tokens).toBe(42);
  });

  it('treats LLM "unknown"/"null"/empty strings as null', async () => {
    mockChat.mockResolvedValueOnce({
      text: JSON.stringify({ work_mode: 'unknown', seniority: 'null' }),
      tokens: 5,
    });
    const out = await analyzePosting(
      'j',
      makePosting({ title: 'Engineer', description: 'x', location: 'x' }),
      'k',
      openai,
    );
    expect(out.record.work_mode).toBe('unknown');
    expect(out.record.seniority).toBeNull();
  });

  it('rejects invalid work_mode values from the LLM', async () => {
    mockChat.mockResolvedValueOnce({
      text: JSON.stringify({ work_mode: 'partial-remote', seniority: 'mid' }),
      tokens: 5,
    });
    const out = await analyzePosting(
      'j',
      makePosting({ title: 'Engineer', description: 'x', location: 'x' }),
      'k',
      openai,
    );
    expect(out.record.work_mode).toBe('unknown');
    expect(out.record.seniority).toBe('mid');
  });

  it('swallows LLM errors and falls back to nulls', async () => {
    mockChat.mockRejectedValueOnce(new Error('boom'));
    const out = await analyzePosting(
      'j',
      makePosting({ title: 'Engineer', description: 'x', location: 'x' }),
      'k',
      openai,
    );
    expect(out.record.work_mode).toBe('unknown');
    expect(out.record.seniority).toBeNull();
    expect(out.tokens).toBe(0);
  });

  it('returns nulls when LLM returns non-JSON text', async () => {
    mockChat.mockResolvedValueOnce({ text: 'just words, no json', tokens: 7 });
    const out = await analyzePosting(
      'j',
      makePosting({ title: 'Engineer', description: 'x', location: 'x' }),
      'k',
      openai,
    );
    expect(out.record.work_mode).toBe('unknown');
    expect(out.record.seniority).toBeNull();
    expect(out.tokens).toBe(7);
  });

  it('parses LPA salary range', async () => {
    const posting = makePosting({
      title: 'Senior Backend',
      description: 'fully remote',
      salary: '15-25 LPA',
    });
    const out = await analyzePosting('j', posting, 'k', openai);
    expect(out.record.salary_min).toBe(15 * 100_000);
    expect(out.record.salary_max).toBe(25 * 100_000);
  });

  it('parses k-range and single-LPA salary', async () => {
    const a = await analyzePosting(
      'j',
      makePosting({ title: 'Senior remote backend', description: 'x', salary: '$120-160k' }),
      'k',
      openai,
    );
    expect(a.record.salary_min).toBe(120_000);
    expect(a.record.salary_max).toBe(160_000);

    const b = await analyzePosting(
      'j',
      makePosting({ title: 'Senior remote backend', description: 'x', salary: '18 LPA' }),
      'k',
      openai,
    );
    expect(b.record.salary_min).toBe(18 * 100_000);
    expect(b.record.salary_max).toBe(18 * 100_000);
  });

  it('returns null salary when unparseable', async () => {
    const out = await analyzePosting(
      'j',
      makePosting({ title: 'Senior remote backend', description: 'x', salary: 'competitive' }),
      'k',
      openai,
    );
    expect(out.record.salary_min).toBeNull();
    expect(out.record.salary_max).toBeNull();
  });

  it('stamps first_seen and last_seen with the same timestamp', async () => {
    const out = await analyzePosting(
      'j',
      makePosting({ title: 'Senior remote backend', description: 'x' }),
      'k',
      openai,
    );
    expect(out.record.first_seen).toBe(out.record.last_seen);
    expect(out.record.status).toBe('new');
  });

  it('detects seniority variants from title', async () => {
    const cases: Array<[string, string | null]> = [
      ['Junior Backend Developer', 'junior'],
      ['Sr. Software Engineer', 'senior'],
      ['Engineering Lead', 'lead'],
      ['Staff Engineer', 'principal'],
      ['Software Engineering Intern', 'intern'],
    ];
    for (const [title, expected] of cases) {
      const out = await analyzePosting(
        'j',
        makePosting({ title, description: 'fully remote' }),
        'k',
        openai,
      );
      expect(out.record.seniority).toBe(expected);
    }
  });
});
