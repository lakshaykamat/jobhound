import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findJobs } from '../../src/adapters/serpapi';
import { fakeResponse, installFetchMock, jsonResponse } from '../_helpers/fetch-mock';

let fetchMock: ReturnType<typeof installFetchMock>;

const serpapi = { country: 'in', language: 'en', platforms: [] };

function job(over: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Backend',
    company_name: 'Acme',
    location: 'Bangalore',
    via: 'via LinkedIn',
    description: 'desc',
    share_link: 'https://share',
    apply_options: [{ link: 'https://apply' }],
    detected_extensions: { salary: '15 LPA', schedule_type: 'Full-time', posted_at: '3 days ago' },
    ...over,
  };
}

describe('findJobs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = installFetchMock();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches a single page when there is no next_page_token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobs_results: [job()] }));
    const res = await findJobs(['q'], 3, ['k'], serpapi);
    expect(res.searchesUsed).toBe(1);
    expect(res.postings).toHaveLength(1);
    expect(res.postings[0].via).toBe('LinkedIn');
    expect(res.postings[0].apply_link).toBe('https://apply');
    expect(res.queriesFailed).toBe(0);
    expect(res.quotaExhausted).toBe(false);
  });

  it('follows next_page_token up to maxPagesPerQuery', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobs_results: [job()], serpapi_pagination: { next_page_token: 't1' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobs_results: [job({ company_name: 'B' })] }));

    const res = await findJobs(['q'], 5, ['k'], serpapi);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.searchesUsed).toBe(2);
    expect(res.postings.map((p) => p.company)).toEqual(['Acme', 'B']);
  });

  it('stops on quota exhausted and reports it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'You ran out of searches.' }));
    const res = await findJobs(['q1', 'q2'], 2, ['k'], serpapi);
    expect(res.quotaExhausted).toBe(true);
    expect(res.searchesUsed).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('counts a non-quota error as a failed query and continues', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid API key' }))
      .mockResolvedValueOnce(jsonResponse({ jobs_results: [job()] }));

    const p = findJobs(['q1', 'q2'], 1, ['k'], serpapi);
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.queriesFailed).toBe(1);
    expect(res.postings).toHaveLength(1);
  });

  it('deduplicates postings across queries', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ jobs_results: [job()] }))
      .mockResolvedValueOnce(jsonResponse({ jobs_results: [job()] }));

    const res = await findJobs(['q1', 'q2'], 1, ['k'], serpapi);
    expect(res.postings).toHaveLength(1);
    expect(res.searchesUsed).toBe(2);
  });

  it('applies platform filter (case-insensitive substring on via)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jobs_results: [
          job({ via: 'via LinkedIn' }),
          job({ company_name: 'X', via: 'via Indeed' }),
          job({ company_name: 'Y', via: 'via Lever' }),
        ],
      }),
    );
    const res = await findJobs(['q'], 1, ['k'], serpapi, { platforms: ['linkedin', 'lever'] });
    expect(res.postings.map((p) => p.via)).toEqual(['LinkedIn', 'Lever']);
    expect(res.filteredByPlatform).toBe(1);
  });

  it('retries 5xx HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 502, body: 'gw' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobs_results: [job()] }));

    const p = findJobs(['q'], 1, ['k'], serpapi);
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.postings).toHaveLength(1);
  });

  it('does NOT retry 4xx (non-429) HTTP errors and marks query failed', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401, body: 'auth' }));
    const p = findJobs(['q'], 1, ['k'], serpapi);
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.queriesFailed).toBe(1);
    expect(res.postings).toHaveLength(0);
  });

  it('rotates to the next key when the first key quota is exhausted', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'You ran out of searches.' }))
      .mockResolvedValueOnce(jsonResponse({ jobs_results: [job()] }));

    const res = await findJobs(['q'], 1, ['key1', 'key2'], serpapi);
    expect(res.quotaExhausted).toBe(false);
    expect(res.postings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks quota exhausted only when all keys are exhausted', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'You ran out of searches.' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'You ran out of searches.' }));

    const res = await findJobs(['q'], 1, ['key1', 'key2'], serpapi);
    expect(res.quotaExhausted).toBe(true);
    expect(res.postings).toHaveLength(0);
  });

  it('handles SerpApi rows with missing fields gracefully', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobs_results: [{}] }));
    const res = await findJobs(['q'], 1, ['k'], serpapi);
    expect(res.postings).toHaveLength(1);
    const p = res.postings[0];
    expect(p.title).toBe('');
    expect(p.company).toBe('');
    expect(p.salary).toBeNull();
    expect(p.apply_link).toBe('');
  });
});
