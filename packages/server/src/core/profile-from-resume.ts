import { BaseResume } from '../types';

export interface DerivedProfile {
  skills: string[];
  role_titles: string[];
  years_experience: number | null;
}

export function deriveProfileFromResume(resume: BaseResume, now: Date = new Date()): DerivedProfile {
  return {
    skills: dedupLower(resume.skills),
    role_titles: dedupLower(resume.experience.map((e) => e.title)),
    years_experience: computeYearsExperience(resume.experience.map((e) => e.dates), now),
  };
}

function dedupLower(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

interface YearMonth { year: number; month: number; }

export function computeYearsExperience(dateStrings: string[], now: Date): number | null {
  let totalMonths = 0;
  let parsedAny = false;
  for (const raw of dateStrings) {
    const months = monthsForRange(raw, now);
    if (months == null) continue;
    parsedAny = true;
    totalMonths += months;
  }
  if (!parsedAny) return null;
  return Math.max(0, Math.floor(totalMonths / 12));
}

function monthsForRange(raw: string, now: Date): number | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/\s*(?:-|to|until|through)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const start = parseYearMonth(parts[0]);
  if (!start) return null;

  const endRaw = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const end = isOngoing(endRaw) ? { year: now.getFullYear(), month: now.getMonth() + 1 } : parseYearMonth(endRaw);
  if (!end) return null;

  const months = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  return months > 0 ? months : null;
}

function isOngoing(s: string): boolean {
  return /present|current|now|ongoing|today/i.test(s);
}

function parseYearMonth(s: string): YearMonth | null {
  const t = s.trim();
  if (!t) return null;

  const monthFirst = t.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (monthFirst) {
    const m = MONTHS[monthFirst[1]];
    if (m) return { year: Number(monthFirst[2]), month: m };
  }

  const monthFirstShort = t.match(/^([a-z]+)\.?\s+(\d{2})$/);
  if (monthFirstShort) {
    const m = MONTHS[monthFirstShort[1]];
    if (m) return { year: 2000 + Number(monthFirstShort[2]), month: m };
  }

  const numeric = t.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (numeric) {
    return { year: Number(numeric[2]), month: clampMonth(Number(numeric[1])) };
  }

  const yearMonth = t.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (yearMonth) {
    return { year: Number(yearMonth[1]), month: clampMonth(Number(yearMonth[2])) };
  }

  const yearOnly = t.match(/^(\d{4})$/);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), month: 1 };
  }

  return null;
}

function clampMonth(m: number): number {
  if (!Number.isFinite(m) || m < 1) return 1;
  if (m > 12) return 12;
  return m;
}
