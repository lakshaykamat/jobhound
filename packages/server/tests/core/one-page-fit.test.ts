import { describe, expect, it } from 'vitest';
import { fitToOnePage } from '../../src/core/one-page-fit';
import { TailoredBullet } from '../../src/types';
import { makeTailoredResume } from '../_helpers/factories';

function bullets(...scores: number[]): TailoredBullet[] {
  return scores.map((s, i) => ({
    text: `Bullet ${i} describing meaningful production-grade work shipped to many users.`,
    jd_relevance: s,
  }));
}

describe('fitToOnePage', () => {
  it('leaves a short resume untouched', () => {
    const tailored = makeTailoredResume();
    const result = fitToOnePage(tailored);
    expect(result.dropped).toHaveLength(0);
    expect(result.truncated).toBe(false);
    expect(result.trimmed.experience[0].bullets).toHaveLength(3);
  });

  it('drops the lowest-relevance bullet first when overflowing', () => {
    const tailored = makeTailoredResume({
      summary: 'long padding word '.repeat(300),
      experience: [
        {
          company: 'Acme',
          title: 'Senior Backend Engineer',
          dates: 'Jan 2023 – Present',
          location: 'Remote',
          bullets: bullets(0.9, 0.8, 0.7, 0.05 /* lowest */, 0.6),
        },
      ],
    });
    const result = fitToOnePage(tailored);
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.dropped[0].bullet_text).toContain('Bullet 3');
  });

  it('never drops the last bullet of a section', () => {
    const stuffed = makeTailoredResume({
      summary: 'X'.repeat(2000),
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          dates: '2024',
          location: null,
          bullets: bullets(0.1),
        },
      ],
    });
    const result = fitToOnePage(stuffed);
    expect(result.trimmed.experience[0].bullets.length).toBeGreaterThan(0);
  });

  it('flags truncation when no bullets can be dropped to fit', () => {
    const huge = makeTailoredResume({
      summary: 'Z'.repeat(5000),
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          dates: '2024',
          location: null,
          bullets: bullets(0.5),
        },
      ],
    });
    const result = fitToOnePage(huge);
    expect(result.truncated).toBe(true);
  });

  it('does not mutate the input resume', () => {
    const tailored = makeTailoredResume({
      summary: 'Z'.repeat(3000),
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          dates: '2024',
          location: null,
          bullets: bullets(0.9, 0.8, 0.1),
        },
      ],
    });
    const before = JSON.stringify(tailored);
    fitToOnePage(tailored);
    expect(JSON.stringify(tailored)).toBe(before);
  });
});
