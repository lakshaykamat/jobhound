import { describe, expect, it } from 'vitest';
import { normalizeProfile } from '../../src/core/profile';

describe('normalizeProfile', () => {
  it('returns an empty/default profile for an empty object', () => {
    const p = normalizeProfile({});
    expect(p.skills).toEqual([]);
    expect(p.role_titles).toEqual([]);
    expect(p.seniority).toBe('');
    expect(p.years_experience).toBeNull();
    expect(p.relocation_open).toBe(false);
    expect(p.preferred_company_size).toEqual([]);
    expect(p.compensation_currency).toBeNull();
    expect(p.min_annual_salary).toBeNull();
  });

  it('lowercases, trims, and dedupes string lists', () => {
    const p = normalizeProfile({ skills: ['  NodeJS', 'nodejs', 'Python', ''] });
    expect(p.skills).toEqual(['nodejs', 'python']);
  });

  it('drops non-string items in string lists silently', () => {
    const p = normalizeProfile({ skills: ['ruby', 42 as unknown as string, null, 'go'] });
    expect(p.skills).toEqual(['ruby', 'go']);
  });

  it('validates work_mode_preference against the allowed enum', () => {
    const p = normalizeProfile({
      work_mode_preference: ['Remote', 'invalid', 'hybrid', 'remote'],
    });
    expect(p.work_mode_preference).toEqual(['remote', 'hybrid']);
  });

  it('validates preferred_company_size against the allowed enum', () => {
    const p = normalizeProfile({
      preferred_company_size: ['Startup', 'huge', 'enterprise'],
    });
    expect(p.preferred_company_size).toEqual(['startup', 'enterprise']);
  });

  it('coerces years_experience and rejects negative/non-numeric', () => {
    expect(normalizeProfile({ years_experience: '5' }).years_experience).toBe(5);
    expect(normalizeProfile({ years_experience: 4.7 }).years_experience).toBe(4);
    expect(normalizeProfile({ years_experience: -1 }).years_experience).toBeNull();
    expect(normalizeProfile({ years_experience: 'abc' }).years_experience).toBeNull();
  });

  it('treats relocation_open=non-boolean as false', () => {
    expect(normalizeProfile({ relocation_open: 'yes' }).relocation_open).toBe(false);
    expect(normalizeProfile({ relocation_open: true }).relocation_open).toBe(true);
  });

  it('returns null for empty/whitespace compensation_currency', () => {
    expect(normalizeProfile({ compensation_currency: '   ' }).compensation_currency).toBeNull();
    expect(normalizeProfile({ compensation_currency: 'INR' }).compensation_currency).toBe('inr');
  });
});

