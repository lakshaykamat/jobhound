import { SerpApiConfig } from '../config';
import { Logger, logger as rootLogger } from '../logger';
import { RawPosting } from '../types';
import {
  SERPAPI_BACKOFF_BASE_MS,
  SERPAPI_BACKOFF_MAX_MS,
  SERPAPI_MAX_ATTEMPTS,
  SERPAPI_URL,
} from '../constants';
import { retry } from './retry';

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
  queriesFailed: number;
  quotaExhausted: boolean;
}

export interface FindOptions {
  /** Platform whitelist matched against the posting's `via` field (case-insensitive substring). Empty/undefined = no filter. */
  platforms?: string[];
}

export async function findJobs(
  queries: string[],
  maxPagesPerQuery: number,
  apiKeys: string[],
  serpapi: SerpApiConfig,
  options: FindOptions = {},
  log: Logger = rootLogger,
): Promise<FindResult> {
  const all: RawPosting[] = [];
  let searchesUsed = 0;
  let queriesFailed = 0;
  let quotaExhausted = false;
  let keyIndex = 0;

  for (const query of queries) {
    if (quotaExhausted) break;
    const qLog = log.child({ query });
    let nextToken: string | undefined;
    try {
      for (let page = 1; page <= maxPagesPerQuery; page++) {
        qLog.debug('fetching SerpApi page', { page });

        // Fetch with the current key; rotate on quota exhaustion.
        let data: SerpApiResponse;
        while (true) {
          data = await fetchPage(query, apiKeys[keyIndex], nextToken, serpapi, qLog);
          if (data.error && isQuotaExhausted(data.error)) {
            keyIndex++;
            if (keyIndex >= apiKeys.length) {
              qLog.error('all SerpApi keys exhausted; stopping discovery', {
                page,
                serpapi_error: data.error,
              });
              quotaExhausted = true;
              break;
            }
            qLog.warn('SerpApi key quota exhausted; rotating to next key', {
              page,
              next_key_index: keyIndex,
            });
            continue;
          }
          break;
        }

        if (quotaExhausted) break;

        if (data!.error) {
          throw new Error(`SerpApi error payload on p${page}: ${data!.error}`);
        }
        searchesUsed++;
        const results = data!.jobs_results ?? [];
        for (const j of results) all.push(toRawPosting(j));
        qLog.info('SerpApi page fetched', {
          page,
          results: results.length,
          has_next_page: Boolean(data!.serpapi_pagination?.next_page_token),
        });

        nextToken = data!.serpapi_pagination?.next_page_token;
        if (!nextToken) break;
      }
    } catch (err) {
      queriesFailed++;
      qLog.error('query failed; continuing with remaining queries', { err });
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

  return {
    postings: platformFiltered.kept,
    searchesUsed,
    filteredByPlatform: platformFiltered.dropped,
    queriesFailed,
    quotaExhausted,
  };
}

function isQuotaExhausted(serpapiError: string): boolean {
  return /out of searches|monthly.*(limit|quota)|exceeded.*(searches|quota)/i.test(
    serpapiError,
  );
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
  if (nextToken) url.searchParams.set('next_page_token', nextToken);

  return retry(
    async () => {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return (await res.json()) as SerpApiResponse;
      const body = await res.text();
      throw new SerpApiHttpError(res.status, `SerpApi HTTP ${res.status}: ${body.slice(0, 200)}`);
    },
    {
      label: 'SerpApi request',
      maxAttempts: SERPAPI_MAX_ATTEMPTS,
      backoffBaseMs: SERPAPI_BACKOFF_BASE_MS,
      backoffMaxMs: SERPAPI_BACKOFF_MAX_MS,
      shouldRetry: (err) =>
        err instanceof SerpApiHttpError ? err.status === 429 || err.status >= 500 : true,
      log,
    },
  );
}

class SerpApiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
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

