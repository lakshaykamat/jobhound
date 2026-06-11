import { DedupStrategy, JobRecord, JobStatus, WorkMode } from "./types";

// --- External services (fixed) ---

export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const SERPAPI_URL = "https://serpapi.com/search.json";

// --- Retry / backoff (fixed; rarely tuned per deployment) ---

export const SERPAPI_MAX_ATTEMPTS = 4;
export const SERPAPI_BACKOFF_BASE_MS = 1000;
export const SERPAPI_BACKOFF_MAX_MS = 8000;
export const OPENAI_MAX_ATTEMPTS = 4;
export const OPENAI_BACKOFF_BASE_MS = 1000;
export const OPENAI_BACKOFF_MAX_MS = 8000;

// --- Server plumbing (fixed) ---

export const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

// --- Domain enums ---

export const JOB_STATUSES: JobStatus[] = [
  "new",
  "reviewed",
  "applied",
  "filtered",
];
export const VALID_WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];

export const JOB_COLUMNS: (keyof JobRecord)[] = [
  "job_id",
  "title",
  "company",
  "location",
  "work_mode",
  "salary_min",
  "salary_max",
  "seniority",
  "source",
  "apply_url",
  "posted_date",
  "score",
  "rationale",
  "breakdown",
  "status",
  "first_seen",
  "last_seen",
];

// =====================================================================
// DEFAULTS — used by config loader when the JSON omits a field. Override
// any of these in config.json under the matching section. Do not read
// these directly from runtime code; read from the loaded AppConfig.
// =====================================================================

// cycle
export const DEFAULT_MAX_PAGES_PER_QUERY = 1;
export const DEFAULT_SCORE_THRESHOLD = 70;
export const DEFAULT_DEDUP_STRATEGY: DedupStrategy = "title_company_via";
export const DEFAULT_MAX_JOB_AGE_DAYS = 7;

// server
export const DEFAULT_POLL_INTERVAL_SECONDS = 21600;
export const DEFAULT_HTTP_PORT = 8787;

// serpapi
export const DEFAULT_SERPAPI_COUNTRY = "in";
export const DEFAULT_SERPAPI_LANGUAGE = "en";
export const DEFAULT_SERPAPI_PLATFORMS: readonly string[] = [
  "linkedin",
  "wellfound",
  "instahyre",
  "naukri",
  "cutshort",
  "uplers",
  "hirect",
  "lever",
  "greenhouse",
  "ashby",
];

// openai
export const DEFAULT_OPENAI_MODEL = "gpt-5.2";
export const DEFAULT_LLM_CONCURRENCY = 4;

// LLM token budgets & input char limits
export const ANALYZE_MAX_TOKENS = 80;
export const SCORE_MAX_TOKENS = 500;
export const DESCRIPTION_MAX_CHARS = 4000;

// scoring (LLM scores 5 axes; recency is computed deterministically)
// Weights must sum to 100.
export const DEFAULT_SCORE_AXIS_WEIGHTS = {
  skills_match: 30,
  seniority_match: 15,
  location_match: 15,
  comp_match: 10,
  domain_match: 15,
  recency: 15,
} as const;
export const DEFAULT_DEALBREAKER_SCORE_CAP = 40;
export const DEFAULT_RECENCY_FULL_DAYS = 7;
export const DEFAULT_RECENCY_DECAY_DAYS = 60;
