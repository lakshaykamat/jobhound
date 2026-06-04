/**
 * Parse SerpApi's relative posted_at strings into an ISO date (YYYY-MM-DD)
 * and into an age in days. Returns null when the string is empty or
 * unparseable — callers should treat null as "unknown, do not filter".
 */
export function parsePostedAt(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s.includes('just') || s.includes('today')) return isoDate(new Date());

  const match = s.match(/(\d+)\s+(hour|day|week|month)/);
  if (!match) return null;

  const n = Number(match[1]);
  const days =
    match[2] === 'hour' ? 0
    : match[2] === 'day' ? n
    : match[2] === 'week' ? n * 7
    : n * 30;

  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

export function ageInDaysFromIso(isoDateStr: string | null): number | null {
  if (!isoDateStr) return null;
  const t = Date.parse(isoDateStr);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
