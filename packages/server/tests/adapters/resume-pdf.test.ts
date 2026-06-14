import { describe, expect, it } from 'vitest';
import { ONE_PAGE_MAX_HEIGHT, measureResume, renderResume } from '../../src/adapters/resume-pdf';
import { makeTailoredResume } from '../_helpers/factories';

describe('renderResume', () => {
  it('returns a valid PDF buffer', async () => {
    const buf = await renderResume(makeTailoredResume());
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders even with empty sections', async () => {
    const buf = await renderResume(
      makeTailoredResume({ summary: '', experience: [], projects: [], skills: [], education: [] }),
    );
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});

describe('measureResume', () => {
  it('returns a positive height for a normal resume', () => {
    const h = measureResume(makeTailoredResume());
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(ONE_PAGE_MAX_HEIGHT);
  });

  it('grows when more bullets are added', () => {
    const small = measureResume(makeTailoredResume());
    const big = measureResume(
      makeTailoredResume({
        experience: [
          {
            company: 'Acme',
            title: 'Senior Backend Engineer',
            dates: 'Jan 2023 – Present',
            location: 'Remote',
            bullets: Array.from({ length: 10 }, (_, i) => ({
              text: `Long bullet number ${i} describing significant production impact at scale.`,
              jd_relevance: 0.5,
            })),
          },
        ],
      }),
    );
    expect(big).toBeGreaterThan(small);
  });
});
