import { describe, expect, it } from 'vitest';
import { computeYearsExperience, deriveProfileFromResume } from '../../src/core/profile-from-resume';
import { BaseResume } from '../../src/types';

function makeResume(overrides: Partial<BaseResume> = {}): BaseResume {
  return {
    contact: { name: 'Test', email: 't@example.com', phone: null, location: null, links: [] },
    summary: '',
    experience: [],
    projects: [],
    skills: [],
    education: [],
    source_pdf_name: 'resume.pdf',
    parsed_at: '01/01/2026',
    ...overrides,
  };
}

describe('deriveProfileFromResume', () => {
  it('lowercases and dedups skills', () => {
    const resume = makeResume({ skills: ['TypeScript', 'typescript', 'Node.js', 'React'] });
    const derived = deriveProfileFromResume(resume, new Date('2026-06-12'));
    expect(derived.skills).toEqual(['typescript', 'node.js', 'react']);
  });

  it('extracts deduped role_titles from experience entries', () => {
    const resume = makeResume({
      experience: [
        { company: 'A', title: 'Backend Engineer', dates: '2022 - 2024', location: null, bullets: [] },
        { company: 'B', title: 'backend engineer', dates: '2020 - 2022', location: null, bullets: [] },
        { company: 'C', title: 'Software Engineer', dates: '2019 - 2020', location: null, bullets: [] },
      ],
    });
    const derived = deriveProfileFromResume(resume, new Date('2026-06-12'));
    expect(derived.role_titles).toEqual(['backend engineer', 'software engineer']);
  });

  it('returns null years_experience when no experience entries', () => {
    const derived = deriveProfileFromResume(makeResume(), new Date('2026-06-12'));
    expect(derived.years_experience).toBeNull();
  });
});

describe('computeYearsExperience', () => {
  const now = new Date('2026-06-12');

  it('handles month-name ranges with Present', () => {
    expect(computeYearsExperience(['Jan 2023 - Present'], now)).toBe(3);
  });

  it('sums multiple closed ranges', () => {
    // 24 months + 12 months = 36 months = 3 years
    expect(computeYearsExperience(['Jan 2022 - Dec 2023', 'Jan 2021 - Dec 2021'], now)).toBe(3);
  });

  it('handles bare year ranges', () => {
    // 2019 Jan -> 2021 Jan = 25 months ≈ 2 years
    expect(computeYearsExperience(['2019 - 2021'], now)).toBe(2);
  });

  it('handles en-dash and em-dash separators', () => {
    expect(computeYearsExperience(['Jan 2023 – Dec 2024'], now)).toBe(2);
    expect(computeYearsExperience(['Jan 2023 — Dec 2024'], now)).toBe(2);
  });

  it('floors partial years (6 months → 0)', () => {
    expect(computeYearsExperience(['Jan 2024 - Jun 2024'], now)).toBe(0);
  });

  it('handles numeric MM/YYYY style', () => {
    expect(computeYearsExperience(['03/2023 - 03/2024'], now)).toBe(1);
  });

  it('treats unparseable entries as null and returns null when nothing parses', () => {
    expect(computeYearsExperience(['some random text', ''], now)).toBeNull();
  });

  it('skips unparseable but counts the rest', () => {
    expect(computeYearsExperience(['unparseable', 'Jan 2024 - Dec 2024'], now)).toBe(1);
  });

  it('recognises Current / Now as ongoing', () => {
    expect(computeYearsExperience(['Jan 2025 - Current'], now)).toBe(1);
    expect(computeYearsExperience(['Jan 2025 - now'], now)).toBe(1);
  });
});
