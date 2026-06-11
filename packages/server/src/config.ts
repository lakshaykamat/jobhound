import { readFileSync } from 'fs';
import { logger } from './logger';
import {
  DEFAULT_DEALBREAKER_SCORE_CAP,
  DEFAULT_DEDUP_STRATEGY,
  DEFAULT_LLM_CONCURRENCY,
  DEFAULT_MAX_JOB_AGE_DAYS,
  DEFAULT_MAX_PAGES_PER_QUERY,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_HTTP_PORT,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_RECENCY_DECAY_DAYS,
  DEFAULT_RECENCY_FULL_DAYS,
  DEFAULT_SCORE_AXIS_WEIGHTS,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_SERPAPI_COUNTRY,
  DEFAULT_SERPAPI_LANGUAGE,
  DEFAULT_SERPAPI_PLATFORMS,
} from './constants';
import { normalizeProfile } from './core/profile';
import { DedupStrategy, FitProfile, ScoreAxis } from './types';

export interface CycleConfig {
  queries: string[];
  score_threshold: number;
  max_pages_per_query: number;
  dedup_strategy: DedupStrategy;
  max_job_age_days: number;
}

export interface ServerConfig {
  poll_interval_seconds: number;
  http_port: number;
}

export interface SerpApiConfig {
  country: string;
  language: string;
  /** Whitelist matched against each posting's `via` field (case-insensitive substring). Empty array = no filter (accept all platforms). */
  platforms: string[];
}

export interface OpenAiConfig {
  model: string;
  llm_concurrency: number;
}

export type AxisWeights = Record<ScoreAxis, number>;

export interface ScoringConfig {
  axis_weights: AxisWeights;
  dealbreaker_score_cap: number;
  recency_full_days: number;
  recency_decay_days: number;
}

export interface AppConfig {
  cycle: CycleConfig;
  server: ServerConfig;
  serpapi: SerpApiConfig;
  openai: OpenAiConfig;
  scoring: ScoringConfig;
  profile: FitProfile;
}

interface ConfigFile {
  cycle?: Partial<CycleConfig> & { query?: string; roles?: string[]; locations?: string[] };
  server?: Partial<ServerConfig>;
  serpapi?: Partial<SerpApiConfig>;
  openai?: Partial<OpenAiConfig>;
  scoring?: Partial<ScoringConfig>;
  profile?: Record<string, unknown>;
}

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as ConfigFile;
  if (!raw.profile) {
    throw new Error('config must define "profile" with a FitProfile');
  }
  const cfg = buildConfig(raw);
  validateConfig(cfg);
  return cfg;
}

function buildConfig(raw: ConfigFile): AppConfig {
  return {
    cycle: {
      queries: normalizeQueries(raw.cycle),
      score_threshold: normalizeScoreThreshold(raw.cycle?.score_threshold),
      max_pages_per_query: raw.cycle?.max_pages_per_query ?? DEFAULT_MAX_PAGES_PER_QUERY,
      dedup_strategy: raw.cycle?.dedup_strategy ?? DEFAULT_DEDUP_STRATEGY,
      max_job_age_days: raw.cycle?.max_job_age_days ?? DEFAULT_MAX_JOB_AGE_DAYS,
    },
    server: {
      poll_interval_seconds: raw.server?.poll_interval_seconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
      http_port: raw.server?.http_port ?? DEFAULT_HTTP_PORT,
    },
    serpapi: {
      country: raw.serpapi?.country ?? DEFAULT_SERPAPI_COUNTRY,
      language: raw.serpapi?.language ?? DEFAULT_SERPAPI_LANGUAGE,
      // Omitted field → use the hardcoded default list. Explicit array (even []) → use what was set.
      platforms:
        raw.serpapi?.platforms === undefined
          ? [...DEFAULT_SERPAPI_PLATFORMS]
          : Array.isArray(raw.serpapi.platforms)
            ? raw.serpapi.platforms.map((p) => String(p).trim().toLowerCase()).filter(Boolean)
            : [...DEFAULT_SERPAPI_PLATFORMS],
    },
    openai: {
      model: raw.openai?.model ?? DEFAULT_OPENAI_MODEL,
      llm_concurrency: raw.openai?.llm_concurrency ?? DEFAULT_LLM_CONCURRENCY,
    },
    scoring: {
      axis_weights: normalizeAxisWeights(raw.scoring?.axis_weights),
      dealbreaker_score_cap:
        raw.scoring?.dealbreaker_score_cap ?? DEFAULT_DEALBREAKER_SCORE_CAP,
      recency_full_days: raw.scoring?.recency_full_days ?? DEFAULT_RECENCY_FULL_DAYS,
      recency_decay_days: raw.scoring?.recency_decay_days ?? DEFAULT_RECENCY_DECAY_DAYS,
    },
    profile: normalizeProfile(raw.profile!),
  };
}

export function validateConfig(cfg: AppConfig): void {
  const errs: string[] = [];

  // cycle
  if (cfg.cycle.queries.length === 0) errs.push('cycle.queries must be non-empty');
  if (cfg.cycle.max_pages_per_query < 1) errs.push('cycle.max_pages_per_query must be >= 1');
  if (cfg.cycle.max_job_age_days < 0) errs.push('cycle.max_job_age_days must be >= 0');

  // server
  if (cfg.server.poll_interval_seconds < 60) {
    errs.push('server.poll_interval_seconds must be >= 60 (one minute)');
  }
  if (
    !Number.isInteger(cfg.server.http_port) ||
    cfg.server.http_port < 1 ||
    cfg.server.http_port > 65535
  ) {
    errs.push('server.http_port must be an integer in [1, 65535]');
  }

  // serpapi
  if (!/^[a-z]{2}$/.test(cfg.serpapi.country)) {
    errs.push(`serpapi.country must be a 2-letter ISO code, got "${cfg.serpapi.country}"`);
  }
  if (!/^[a-z]{2,3}$/.test(cfg.serpapi.language)) {
    errs.push(`serpapi.language must be a 2-3 letter code, got "${cfg.serpapi.language}"`);
  }

  // openai
  if (!cfg.openai.model) errs.push('openai.model must be a non-empty string');
  if (cfg.openai.llm_concurrency < 1) errs.push('openai.llm_concurrency must be >= 1');

  // scoring
  if (cfg.scoring.recency_full_days >= cfg.scoring.recency_decay_days) {
    errs.push('scoring.recency_full_days must be < scoring.recency_decay_days');
  }
  if (cfg.scoring.dealbreaker_score_cap < 0 || cfg.scoring.dealbreaker_score_cap > 100) {
    errs.push('scoring.dealbreaker_score_cap must be in [0, 100]');
  }

  // profile sanity
  if (cfg.profile.skills.length === 0) errs.push('profile.skills should not be empty');
  if (cfg.profile.role_titles.length === 0) errs.push('profile.role_titles should not be empty');
  if (cfg.profile.compensation_currency != null && cfg.profile.min_annual_salary == null) {
    logger.warn('profile.compensation_currency is set but min_annual_salary is null; comp_match axis will be neutral', {
      currency: cfg.profile.compensation_currency,
    });
  }

  if (errs.length) {
    throw new Error(`config validation failed:\n  - ${errs.join('\n  - ')}`);
  }
}

function normalizeQueries(cycle: ConfigFile['cycle']): string[] {
  if (cycle?.queries?.length) return cycle.queries.map((q) => q.trim()).filter(Boolean);

  const roles = (cycle?.roles ?? []).map((r) => r.trim()).filter(Boolean);
  const locations = (cycle?.locations ?? []).map((l) => l.trim()).filter(Boolean);
  if (roles.length) {
    const combined = locations.length
      ? roles.flatMap((r) => locations.map((l) => `${r} ${l}`))
      : roles;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of combined) {
      if (seen.has(q)) continue;
      seen.add(q);
      out.push(q);
    }
    return out;
  }

  if (cycle?.query?.trim()) return [cycle.query.trim()];
  throw new Error(
    'config.cycle must define "queries" (string[]), "roles" (+ optional "locations"), or "query" (string)',
  );
}

function normalizeScoreThreshold(value: unknown): number {
  if (value == null) return DEFAULT_SCORE_THRESHOLD;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`score_threshold must be a number in [0, 100], got: ${String(value)}`);
  }
  return n;
}

function normalizeAxisWeights(raw: Partial<AxisWeights> | undefined): AxisWeights {
  const merged: AxisWeights = { ...DEFAULT_SCORE_AXIS_WEIGHTS, ...(raw ?? {}) };
  const sum = (Object.values(merged) as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.001) {
    throw new Error(`scoring.axis_weights must sum to 100, got ${sum}`);
  }
  return merged;
}
