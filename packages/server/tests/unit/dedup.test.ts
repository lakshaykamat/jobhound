import { describe, expect, it } from 'vitest';
import { computeJobId, splitByKnown } from '../../src/core/dedup';
import { makePosting, makeRecord } from '../_helpers/factories';

describe('computeJobId', () => {
  it('returns a 16-char hex hash', () => {
    const id = computeJobId({ title: 'X', company: 'Y', via: 'Z' }, 'title_company_via');
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is stable for the same inputs', () => {
    const p = { title: 'Backend Engineer', company: 'Acme', via: 'LinkedIn' };
    expect(computeJobId(p, 'title_company_via')).toBe(
      computeJobId(p, 'title_company_via'),
    );
  });

  it('normalizes case and whitespace', () => {
    const a = computeJobId({ title: 'Backend Engineer', company: 'Acme', via: 'LinkedIn' }, 'title_company_via');
    const b = computeJobId({ title: '  BACKEND   engineer', company: 'acme', via: 'linkedin  ' }, 'title_company_via');
    expect(a).toBe(b);
  });

  it('title_company strategy ignores via', () => {
    const a = computeJobId({ title: 'X', company: 'Y', via: 'LinkedIn' }, 'title_company');
    const b = computeJobId({ title: 'X', company: 'Y', via: 'Indeed' }, 'title_company');
    expect(a).toBe(b);
  });

  it('title_company_via differentiates by via', () => {
    const a = computeJobId({ title: 'X', company: 'Y', via: 'LinkedIn' }, 'title_company_via');
    const b = computeJobId({ title: 'X', company: 'Y', via: 'Indeed' }, 'title_company_via');
    expect(a).not.toBe(b);
  });
});

describe('splitByKnown', () => {
  it('splits postings into fresh and touch based on existing records', () => {
    const p1 = makePosting({ title: 'Backend Engineer', company: 'A', via: 'LinkedIn' });
    const p2 = makePosting({ title: 'Frontend Engineer', company: 'B', via: 'LinkedIn' });
    const known = makeRecord({
      job_id: computeJobId(p1, 'title_company_via'),
      title: 'Backend Engineer',
      company: 'A',
      source: 'linkedin',
    });

    const split = splitByKnown([p1, p2], [known], 'title_company_via');
    expect(split.touch).toHaveLength(1);
    expect(split.touch[0].job_id).toBe(known.job_id);
    expect(split.fresh).toHaveLength(1);
    expect(split.fresh[0].posting.title).toBe('Frontend Engineer');
  });

  it('deduplicates duplicate postings within the same cycle', () => {
    const p = makePosting({ title: 'Backend', company: 'A', via: 'LinkedIn' });
    const split = splitByKnown([p, p, p], [], 'title_company_via');
    expect(split.fresh).toHaveLength(1);
    expect(split.touch).toHaveLength(0);
  });

  it('returns empty arrays when no postings are provided', () => {
    const split = splitByKnown([], [], 'title_company_via');
    expect(split.fresh).toEqual([]);
    expect(split.touch).toEqual([]);
  });

  it('treats every posting as fresh when no existing records', () => {
    const p1 = makePosting({ title: 'A', company: 'X', via: 'L' });
    const p2 = makePosting({ title: 'B', company: 'Y', via: 'L' });
    const split = splitByKnown([p1, p2], [], 'title_company_via');
    expect(split.fresh).toHaveLength(2);
    expect(split.touch).toHaveLength(0);
  });
});
