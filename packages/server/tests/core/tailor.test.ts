import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TailorValidationError, tailorResume } from '../../src/core/tailor';
import { TailoredResume } from '../../src/types';
import { installFetchMock, jsonResponse } from '../_helpers/fetch-mock';
import { makeBaseResume, makeTailoredResume } from '../_helpers/factories';

let fetchMock: ReturnType<typeof installFetchMock>;

function llmReply(tailored: TailoredResume) {
  return jsonResponse({
    choices: [{ message: { content: JSON.stringify(tailored) } }],
    usage: { total_tokens: 1500 },
  });
}

describe('tailorResume', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = installFetchMock();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns tailored result on first valid response', async () => {
    fetchMock.mockResolvedValueOnce(llmReply(makeTailoredResume()));
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD body', apiKey: 'sk-test', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.tailored.contact.name).toBe('Jane Doe');
    expect(result.tokens).toBe(1500);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts skills the LLM adds beyond the base resume', async () => {
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makeTailoredResume({
          skills: ['Rust' /* not in base */, 'Node.js', 'Kubernetes', 'PostgreSQL', 'Redis'],
        }),
      ),
    );
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.tailored.skills).toContain('Rust');
  });

  it('throws TailorValidationError when all attempts fabricate a company', async () => {
    const badResume = makeTailoredResume({
      experience: [
        {
          company: 'ImaginaryCo',
          title: 'Engineer',
          dates: '2024',
          location: null,
          bullets: [{ text: 'b', jd_relevance: 0.5 }],
        },
      ],
    });
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(llmReply(badResume));
    }
    const assertion = expect(
      tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' }),
    ).rejects.toBeInstanceOf(TailorValidationError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('rejects fabricated company in experience', async () => {
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makeTailoredResume({
          experience: [
            {
              company: 'ImaginaryCo',
              title: 'Engineer',
              dates: '2024',
              location: null,
              bullets: [{ text: 'b', jd_relevance: 0.5 }],
            },
          ],
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(llmReply(makeTailoredResume()));
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('truncates over-long bullets at a word boundary instead of retrying', async () => {
    const longText = ('Owned the deployment stack across services and shipped reliability work '.repeat(5)).trim();
    expect(longText.length).toBeGreaterThan(220);
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makeTailoredResume({
          experience: [
            {
              company: 'Acme',
              title: 'E',
              dates: '2024',
              location: null,
              bullets: [{ text: longText, jd_relevance: 0.5 }],
            },
          ],
        }),
      ),
    );
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledOnce();
    const bullet = result.tailored.experience[0].bullets[0].text;
    expect(bullet.length).toBeLessThanOrEqual(220);
    expect(bullet.endsWith(' ')).toBe(false);
  });

  it('refines an existing draft via the refine system prompt', async () => {
    fetchMock.mockResolvedValueOnce(llmReply(makeTailoredResume()));
    const promise = tailorResume({
      base: makeBaseResume(),
      jd: 'JD',
      apiKey: 'k',
      model: 'gpt-4o-mini',
      draft: makeTailoredResume(),
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ats).toBeDefined();
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemMsg = sentBody.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg.content).toContain('REFINEMENT MODE');
  });

  it('case-insensitively matches skills against base resume', async () => {
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makeTailoredResume({
          skills: ['typescript', 'NODE.JS'],
          must_have_keywords: ['typescript', 'node.js'],
        }),
      ),
    );
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.tailored.skills).toEqual(['typescript', 'NODE.JS']);
  });

  it('re-runs in refine mode when the first pass scores below the ATS target', async () => {
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makeTailoredResume({
          skills: ['TypeScript'],
          must_have_keywords: ['TypeScript', 'Redis', 'Kubernetes', 'PostgreSQL'],
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makeTailoredResume({
          skills: ['TypeScript', 'Redis', 'Kubernetes', 'PostgreSQL'],
          must_have_keywords: ['TypeScript', 'Redis', 'Kubernetes', 'PostgreSQL'],
        }),
      ),
    );
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ats.score).toBe(1);
    const refineCall = JSON.parse(fetchMock.mock.calls[1][1].body);
    const systemMsg = refineCall.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg.content).toContain('REFINEMENT MODE');
    const userMsg = refineCall.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).toContain('ATS GAP');
  });

  it('stops retrying when the score plateaus', async () => {
    const draft = makeTailoredResume({
      skills: ['TypeScript'],
      must_have_keywords: ['TypeScript', 'Kubernetes'],
    });
    fetchMock.mockResolvedValueOnce(llmReply(draft));
    fetchMock.mockResolvedValueOnce(llmReply(draft));
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    // First pass + one retry (no improvement) → 2 calls, then we stop without a third retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ats.score).toBe(0.5);
  });
});
