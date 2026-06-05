import { describe, expect, it } from 'vitest';
import {
  ANALYZE_SCHEMA,
  SCORE_SCHEMA,
  buildAnalyzePrompt,
  buildScorePrompt,
} from '../../src/prompts';
import { DESCRIPTION_MAX_CHARS } from '../../src/constants';
import { makeProfile, makeRecord } from '../_helpers/factories';

describe('buildAnalyzePrompt', () => {
  it('includes title, location, and description', () => {
    const prompt = buildAnalyzePrompt({
      title: 'Backend',
      company: 'A',
      location: 'Bangalore',
      via: 'L',
      apply_link: '',
      description: 'Build APIs',
      salary: null,
      schedule: null,
      posted_at: null,
    });
    expect(prompt).toContain('Title: Backend');
    expect(prompt).toContain('Location: Bangalore');
    expect(prompt).toContain('Build APIs');
  });

  it('truncates very long descriptions', () => {
    const long = 'x'.repeat(DESCRIPTION_MAX_CHARS + 500);
    const prompt = buildAnalyzePrompt({
      title: 'T',
      company: '',
      location: '',
      via: '',
      apply_link: '',
      description: long,
      salary: null,
      schedule: null,
      posted_at: null,
    });
    expect(prompt.length).toBeLessThan(DESCRIPTION_MAX_CHARS + 500);
  });

  it('falls back to placeholders when fields are empty', () => {
    const prompt = buildAnalyzePrompt({
      title: '',
      company: '',
      location: '',
      via: '',
      apply_link: '',
      description: '',
      salary: null,
      schedule: null,
      posted_at: null,
    });
    expect(prompt).toContain('(missing)');
    expect(prompt).toContain('(no description provided)');
  });
});

describe('buildScorePrompt', () => {
  it('renders profile + posting sections with all required headers', () => {
    const prompt = buildScorePrompt(
      makeRecord({ title: 'Backend Engineer', company: 'Acme', salary_min: 100, salary_max: 200 }),
      'Some description here',
      makeProfile(),
    );
    expect(prompt).toContain('CANDIDATE PROFILE');
    expect(prompt).toContain('JOB POSTING');
    expect(prompt).toContain('DESCRIPTION');
    expect(prompt).toContain('Backend Engineer');
    expect(prompt).toContain('100–200');
  });

  it('renders unspecified work_mode as "(unspecified)"', () => {
    const prompt = buildScorePrompt(
      makeRecord({ work_mode: 'unknown' }),
      'd',
      makeProfile(),
    );
    expect(prompt).toContain('(unspecified)');
  });

  it('renders empty profile fields with (none) placeholders', () => {
    const prompt = buildScorePrompt(
      makeRecord(),
      'd',
      makeProfile({ skills: [], domains: [], highlights: [] }),
    );
    expect(prompt).toMatch(/Skills: \(none\)/);
    expect(prompt).toMatch(/Highlights:\n {3}\(none\)/);
  });

  it('shows "not published" when no salary is set', () => {
    const prompt = buildScorePrompt(
      makeRecord({ salary_min: null, salary_max: null }),
      'd',
      makeProfile(),
    );
    expect(prompt).toContain('Salary: not published');
  });
});

describe('schemas are exported and valid-shaped', () => {
  it('analyze schema specifies required work_mode and seniority', () => {
    expect(ANALYZE_SCHEMA.name).toBe('analyze_posting');
    expect((ANALYZE_SCHEMA.schema as { required: string[] }).required).toEqual([
      'work_mode',
      'seniority',
    ]);
  });

  it('score schema requires the five LLM axes', () => {
    const axes = ((SCORE_SCHEMA.schema as Record<string, unknown>).properties as Record<
      string,
      { required: string[] }
    >).axes.required;
    expect(axes).toEqual([
      'skills_match',
      'seniority_match',
      'location_match',
      'comp_match',
      'domain_match',
    ]);
  });

});
