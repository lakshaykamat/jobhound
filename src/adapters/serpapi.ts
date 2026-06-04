import { SerpApiConfig } from '../config';
import { ageInDaysFromIso, parsePostedAt } from '../core/posted-at';
import { Logger, logger as rootLogger } from '../logger';
import { RawPosting } from '../types';
import {
  SERPAPI_BACKOFF_BASE_MS,
  SERPAPI_BACKOFF_MAX_MS,
  SERPAPI_MAX_ATTEMPTS,
  SERPAPI_URL,
} from '../constants';

interface SerpApiResponse {
  jobs_results?: SerpApiJob[];
  serpapi_pagination?: { next_page_token?: string };
  error?: string;
}

interface SerpApiJob {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  description?: string;
  share_link?: string;
  apply_options?: { link: string; title?: string }[];
  related_links?: { link: string; text?: string }[];
  detected_extensions?: {
    salary?: string;
    schedule_type?: string;
    posted_at?: string;
  };
}

export interface FindResult {
  postings: RawPosting[];
  searchesUsed: number;
  filteredByPlatform: number;
  filteredByAge: number;
}

export interface FindOptions {
  /** Platform whitelist matched against the posting's `via` field (case-insensitive substring). Empty/undefined = no filter. */
  platforms?: string[];
  /** Drop postings older than this. Null/undefined = no age filter. Unknown dates pass through. */
  maxAgeDays?: number | null;
}

export async function findJobs(
  queries: string[],
  maxPagesPerQuery: number,
  apiKey: string,
  serpapi: SerpApiConfig,
  options: FindOptions = {},
  log: Logger = rootLogger,
): Promise<FindResult> {
  const all: RawPosting[] = [];
  let searchesUsed = 0;

  for (const query of queries) {
    const qLog = log.child({ query });
    let nextToken: string | undefined;
    for (let page = 1; page <= maxPagesPerQuery; page++) {
      qLog.debug('fetching SerpApi page', { page });
      const data = await fetchPage(query, apiKey, nextToken, serpapi, qLog);
      if (data.error) {
        qLog.error('SerpApi returned error payload', { page, serpapi_error: data.error });
        throw new Error(`SerpApi error on "${query}" p${page}: ${data.error}`);
      }
      searchesUsed++;
      const results = data.jobs_results ?? [];
      for (const j of results) all.push(toRawPosting(j));
      qLog.info('SerpApi page fetched', {
        page,
        results: results.length,
        has_next_page: Boolean(data.serpapi_pagination?.next_page_token),
      });

      nextToken = data.serpapi_pagination?.next_page_token;
      if (!nextToken) break;
    }
  }

  const deduped = dedupPostings(all);
  if (all.length !== deduped.length) {
    log.debug('cross-query dedup applied', { before: all.length, after: deduped.length });
  }
  const platformFiltered = filterByPlatform(deduped, options.platforms);
  if (platformFiltered.dropped > 0) {
    log.debug('platform filter dropped postings', {
      dropped: platformFiltered.dropped,
      platforms: options.platforms,
    });
  }
  const ageFiltered = filterByAge(platformFiltered.kept, options.maxAgeDays);
  if (ageFiltered.dropped > 0) {
    log.debug('age filter dropped postings', {
      dropped: ageFiltered.dropped,
      max_age_days: options.maxAgeDays,
    });
  }

  return {
    postings: ageFiltered.kept,
    searchesUsed,
    filteredByPlatform: platformFiltered.dropped,
    filteredByAge: ageFiltered.dropped,
  };
}

function filterByPlatform(
  postings: RawPosting[],
  platforms: string[] | undefined,
): { kept: RawPosting[]; dropped: number } {
  if (!platforms || platforms.length === 0) return { kept: postings, dropped: 0 };
  const needles = platforms.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (needles.length === 0) return { kept: postings, dropped: 0 };
  const kept: RawPosting[] = [];
  let dropped = 0;
  for (const p of postings) {
    const via = p.via.toLowerCase();
    if (needles.some((n) => via.includes(n))) kept.push(p);
    else dropped++;
  }
  return { kept, dropped };
}

function filterByAge(
  postings: RawPosting[],
  maxAgeDays: number | null | undefined,
): { kept: RawPosting[]; dropped: number } {
  if (maxAgeDays == null) return { kept: postings, dropped: 0 };
  const kept: RawPosting[] = [];
  let dropped = 0;
  for (const p of postings) {
    const iso = parsePostedAt(p.posted_at);
    const age = ageInDaysFromIso(iso);
    // Unknown age (null) is kept — lenient default; better to score and let
    // recency-axis weight handle it than to silently drop fresh-looking postings.
    if (age != null && age > maxAgeDays) dropped++;
    else kept.push(p);
  }
  return { kept, dropped };
}

async function fetchPage(
  query: string,
  apiKey: string,
  nextToken: string | undefined,
  serpapi: SerpApiConfig,
  log: Logger,
): Promise<SerpApiResponse> {
  const url = new URL(SERPAPI_URL);
  url.searchParams.set('engine', 'google_jobs');
  url.searchParams.set('q', query);
  url.searchParams.set('gl', serpapi.country);
  url.searchParams.set('hl', serpapi.language);
  url.searchParams.set('api_key', apiKey);
  if (serpapi.location) url.searchParams.set('location', serpapi.location);
  if (serpapi.chips) url.searchParams.set('chips', serpapi.chips);
  if (nextToken) url.searchParams.set('next_page_token', nextToken);
  return fetchWithRetry(url.toString(), log);
}

function dedupPostings(postings: RawPosting[]): RawPosting[] {
  const seen = new Set<string>();
  const out: RawPosting[] = [];
  for (const p of postings) {
    const key = `${p.title.trim().toLowerCase()}|${p.company.trim().toLowerCase()}|${p.via.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function toRawPosting(j: SerpApiJob): RawPosting {
  return {
    title: j.title ?? '',
    company: j.company_name ?? '',
    location: j.location ?? '',
    via: stripVia(j.via),
    apply_link: pickApplyLink(j),
    description: j.description ?? '',
    salary: j.detected_extensions?.salary ?? null,
    schedule: j.detected_extensions?.schedule_type ?? null,
    posted_at: j.detected_extensions?.posted_at ?? null,
  };
}

function stripVia(via?: string): string {
  return via?.replace(/^via\s+/i, '').trim() ?? '';
}

function pickApplyLink(j: SerpApiJob): string {
  return j.apply_options?.[0]?.link ?? j.share_link ?? j.related_links?.[0]?.link ?? '';
}

async function fetchWithRetry(url: string, log: Logger, attempt = 1): Promise<SerpApiResponse> {
  const res = await fetch(url);
  if (res.ok) return res.json() as Promise<SerpApiResponse>;

  const retryable = res.status === 429 || res.status >= 500;
  if (!retryable || attempt >= SERPAPI_MAX_ATTEMPTS) {
    const body = await res.text();
    log.error('SerpApi request failed (non-retryable or attempts exhausted)', {
      status: res.status,
      attempt,
      body_preview: body.slice(0, 200),
    });
    throw new Error(`SerpApi HTTP ${res.status}: ${body}`);
  }

  const delayMs = Math.min(SERPAPI_BACKOFF_BASE_MS * 2 ** (attempt - 1), SERPAPI_BACKOFF_MAX_MS);
  log.warn('SerpApi request failed; retrying', {
    status: res.status,
    attempt,
    max_attempts: SERPAPI_MAX_ATTEMPTS,
    delay_ms: delayMs,
  });
  await new Promise((r) => setTimeout(r, delayMs));
  return fetchWithRetry(url, log, attempt + 1);
}
