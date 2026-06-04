import { FitProfile } from '../types';

const MAX_QUERIES = 12;
const MAX_TITLES = 6;
const MAX_LOCATIONS = 3;
const REMOTE_REGION_HINT = 'india';

/**
 * Build search queries from the profile by combining role titles with
 * locations. Always includes at least one remote variant per title so
 * the search surface covers both onsite-local and remote-global postings.
 */
export function deriveQueries(profile: FitProfile): string[] {
  const titles = pickTop(profile.role_titles, MAX_TITLES);
  const locations = pickTop(profile.locations, MAX_LOCATIONS);

  if (titles.length === 0) {
    throw new Error('cannot derive queries: profile has no role_titles');
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string): void => {
    const trimmed = q.trim().replace(/\s+/g, ' ');
    if (!trimmed || seen.has(trimmed) || out.length >= MAX_QUERIES) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  // Pass 1: each title × remote (broadest coverage first).
  for (const title of titles) {
    add(`${title} remote ${REMOTE_REGION_HINT}`);
  }

  // Pass 2: each non-remote location × top titles.
  const onsiteLocations = locations.filter((l) => l !== 'remote');
  for (const location of onsiteLocations) {
    for (const title of titles) {
      add(`${title} ${location}`);
    }
  }

  // Pass 3: bare titles as a fallback if we still have budget.
  for (const title of titles) {
    add(title);
  }

  return out;
}

function pickTop(list: string[] | undefined, n: number): string[] {
  if (!list) return [];
  return list.slice(0, n).map((s) => s.trim()).filter(Boolean);
}
