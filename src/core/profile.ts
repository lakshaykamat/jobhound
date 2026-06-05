import { CompanySize, FitProfile, WorkModePreference } from '../types';

const VALID_WORK_MODE_PREFS: WorkModePreference[] = ['remote', 'hybrid', 'onsite'];
const VALID_COMPANY_SIZES: CompanySize[] = ['startup', 'scaleup', 'enterprise'];

export function normalizeProfile(obj: Record<string, unknown>): FitProfile {
  return {
    skills: stringList(obj.skills),
    seniority: trimStr(obj.seniority).toLowerCase(),
    years_experience: nonNegInt(obj.years_experience),
    domains: stringList(obj.domains),
    role_titles: stringList(obj.role_titles),
    locations: stringList(obj.locations),
    work_authorization: stringList(obj.work_authorization),
    work_mode_preference: enumList(obj.work_mode_preference, VALID_WORK_MODE_PREFS),
    relocation_open: typeof obj.relocation_open === 'boolean' ? obj.relocation_open : false,
    preferred_company_size: enumList(obj.preferred_company_size, VALID_COMPANY_SIZES),
    availability: trimStr(obj.availability),
    min_annual_salary: nonNegInt(obj.min_annual_salary),
    compensation_currency: trimLowerOrNull(obj.compensation_currency),
    highlights: stringList(obj.highlights),
    notes: trimStr(obj.notes),
  };
}

function enumList<T extends string>(v: unknown, valid: T[]): T[] {
  if (!Array.isArray(v)) return [];
  const validSet = new Set<string>(valid);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim().toLowerCase();
    if (!validSet.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s as T);
  }
  return out;
}

function trimLowerOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s ? s : null;
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function nonNegInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
