import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TailorValidationError, tailorResume } from '../../src/core/tailor';
import { TailorPatchPlan } from '../../src/types';
import { installFetchMock, jsonResponse } from '../_helpers/fetch-mock';
import { makeBaseResume } from '../_helpers/factories';

let fetchMock: ReturnType<typeof installFetchMock>;

function llmReply(plan: TailorPatchPlan) {
  return jsonResponse({
    choices: [{ message: { content: JSON.stringify(toRawPlan(plan)) } }],
    usage: { total_tokens: 1500 },
  });
}

function toRawPlan(plan: TailorPatchPlan) {
  return {
    must_have_keywords: plan.must_have_keywords,
    patches: plan.patches.map((patch) => ({
      op: patch.op,
      reason: patch.reason,
      old_text: 'old_text' in patch ? patch.old_text : null,
      new_text: 'new_text' in patch ? patch.new_text : null,
      old_skills: 'old_skills' in patch ? patch.old_skills : [],
      new_skills: 'new_skills' in patch ? patch.new_skills : [],
      company: 'company' in patch ? patch.company : null,
      title: 'title' in patch ? patch.title : null,
      dates: 'dates' in patch ? patch.dates : null,
      project: 'project' in patch ? patch.project : null,
      bullet_index: 'bullet_index' in patch ? patch.bullet_index : null,
      jd_relevance: 'jd_relevance' in patch ? patch.jd_relevance : null,
    })),
  };
}

function makePatchPlan(overrides: Partial<TailorPatchPlan> = {}): TailorPatchPlan {
  const base = makeBaseResume();
  return {
    must_have_keywords: ['Node.js', 'Kubernetes'],
    patches: [
      {
        op: 'replace_summary',
        reason: 'Mirror backend JD terms in the opener.',
        old_text: base.summary,
        new_text: 'Backend engineer with 4 years building Node.js services and Kubernetes-backed distributed systems.',
      },
      {
        op: 'replace_experience_bullet',
        reason: 'Use JD wording for Kubernetes platform work.',
        company: 'Acme',
        title: 'Senior Backend Engineer',
        dates: 'Jan 2023 – Present',
        bullet_index: 0,
        old_text: base.experience[0].bullets[0],
        new_text: 'Led Kubernetes microservices migration from a monolith while improving backend release reliability.',
        jd_relevance: 0.9,
      },
    ],
    ...overrides,
  };
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

  it('applies valid patches to the base resume', async () => {
    fetchMock.mockResolvedValueOnce(llmReply(makePatchPlan()));
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD body', apiKey: 'sk-test', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.updated.contact.name).toBe('Jane Doe');
    expect(result.updated.summary).toContain('Kubernetes-backed');
    expect(result.updated.experience[0].bullets[0]).toContain('Kubernetes microservices');
    expect(result.patches).toHaveLength(2);
    expect(result.tokens).toBe(1500);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts skills the LLM adds beyond the base resume', async () => {
    const base = makeBaseResume();
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makePatchPlan({
          patches: [
            {
              op: 'set_skills',
              reason: 'Put JD hard skills first.',
              old_skills: base.skills,
              new_skills: ['Rust', 'Node.js', 'Kubernetes', 'PostgreSQL', 'Redis'],
            },
          ],
          must_have_keywords: ['Rust', 'Node.js'],
        }),
      ),
    );
    const promise = tailorResume({ base, jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.updated.skills).toContain('Rust');
  });

  it('throws TailorValidationError when all attempts use stale old text', async () => {
    const badPlan = makePatchPlan({
      patches: [
        {
          op: 'replace_summary',
          reason: 'stale patch',
          old_text: 'This summary is not in the resume.',
          new_text: 'Backend engineer with Node.js.',
        },
      ],
    });
    for (let i = 0; i < 3; i++) fetchMock.mockResolvedValueOnce(llmReply(badPlan));
    const assertion = expect(
      tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' }),
    ).rejects.toBeInstanceOf(TailorValidationError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('rejects fabricated experience targets and retries', async () => {
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makePatchPlan({
          patches: [
            {
              op: 'replace_experience_bullet',
              reason: 'bad company',
              company: 'ImaginaryCo',
              title: 'Engineer',
              dates: '2024',
              bullet_index: 0,
              old_text: 'b',
              new_text: 'Built Node.js APIs.',
              jd_relevance: 0.8,
            },
          ],
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(llmReply(makePatchPlan()));
    const promise = tailorResume({ base: makeBaseResume(), jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects degree claims inserted into visible resume text', async () => {
    const base = makeBaseResume();
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makePatchPlan({
          patches: [
            {
              op: 'set_skills',
              reason: 'bad degree claim',
              old_skills: base.skills,
              new_skills: ['TypeScript', 'MCA'],
            },
          ],
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(llmReply(makePatchPlan()));
    const promise = tailorResume({ base, jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects over-long bullets instead of truncating them', async () => {
    const base = makeBaseResume();
    const longText = ('Owned the deployment stack across services and shipped reliability work '.repeat(5)).trim();
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makePatchPlan({
          patches: [
            {
              op: 'replace_experience_bullet',
              reason: 'too long',
              company: 'Acme',
              title: 'Senior Backend Engineer',
              dates: 'Jan 2023 – Present',
              bullet_index: 0,
              old_text: base.experience[0].bullets[0],
              new_text: longText,
              jd_relevance: 0.8,
            },
          ],
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(llmReply(makePatchPlan()));
    const promise = tailorResume({ base, jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.updated.experience[0].bullets[0].length).toBeLessThanOrEqual(220);
  });

  it('re-runs in refine mode when the first pass scores below the ATS target', async () => {
    const base = makeBaseResume();
    fetchMock.mockResolvedValueOnce(
      llmReply(
        makePatchPlan({
          patches: [
            {
              op: 'set_skills',
              reason: 'only one keyword matched',
              old_skills: base.skills,
              new_skills: ['TypeScript'],
            },
          ],
          must_have_keywords: ['TypeScript', 'Terraform'],
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(
      llmReply({
        patches: [
          {
            op: 'set_skills',
            reason: 'close ATS gap',
            old_skills: ['TypeScript'],
            new_skills: ['TypeScript', 'Terraform'],
          },
        ],
        must_have_keywords: ['TypeScript', 'Terraform'],
      }),
    );
    const promise = tailorResume({ base, jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
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
    const base = makeBaseResume();
    const firstPass = makePatchPlan({
      patches: [
        {
          op: 'set_skills',
          reason: 'only one keyword matched',
          old_skills: base.skills,
          new_skills: ['TypeScript'],
        },
      ],
      must_have_keywords: ['TypeScript', 'Terraform'],
    });
    fetchMock.mockResolvedValueOnce(llmReply(firstPass));
    fetchMock.mockResolvedValueOnce(
      llmReply({
        patches: [],
        must_have_keywords: ['TypeScript', 'Terraform'],
      }),
    );
    const promise = tailorResume({ base, jd: 'JD', apiKey: 'k', model: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ats.score).toBe(0.5);
  });
});
