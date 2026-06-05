import { FitProfile, JobRecord, RawPosting } from '../../src/types';
import { AppConfig } from '../../src/config';
import { DEFAULT_SCORE_AXIS_WEIGHTS } from '../../src/constants';

export function makePosting(overrides: Partial<RawPosting> = {}): RawPosting {
  return {
    title: 'Backend Engineer',
    company: 'Acme',
    location: 'Remote',
    via: 'LinkedIn',
    apply_link: 'https://example.com/apply/1',
    description: 'Build APIs in Node.js. 3+ years required.',
    salary: null,
    schedule: null,
    posted_at: '2 days ago',
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<FitProfile> = {}): FitProfile {
  return {
    skills: ['nodejs', 'typescript', 'postgres'],
    seniority: 'mid',
    years_experience: 4,
    domains: ['saas'],
    role_titles: ['backend engineer', 'nodejs developer'],
    locations: ['new delhi', 'remote'],
    work_authorization: ['in'],
    work_mode_preference: ['remote', 'hybrid'],
    relocation_open: false,
    preferred_company_size: ['startup'],
    availability: 'immediate',
    min_annual_salary: 2_000_000,
    compensation_currency: 'inr',
    highlights: ['scaled api to 5k rps'],
    notes: 'india-based, open to remote',
    ...overrides,
  };
}

export function makeRecord(overrides: Partial<JobRecord> = {}): JobRecord {
  const now = '2026-06-05T12:00:00.000Z';
  return {
    job_id: 'abc123',
    title: 'Backend Engineer',
    company: 'Acme',
    location: 'Remote',
    work_mode: 'remote',
    salary_min: null,
    salary_max: null,
    seniority: 'mid',
    source: 'linkedin',
    apply_url: 'https://example.com/apply/1',
    posted_date: '2026-06-03',
    score: 0,
    rationale: '',
    breakdown: null,
    status: 'new',
    first_seen: now,
    last_seen: now,
    ...overrides,
  };
}

export interface ConfigOverrides {
  cycle?: Partial<AppConfig['cycle']>;
  daemon?: Partial<AppConfig['daemon']>;
  serpapi?: Partial<AppConfig['serpapi']>;
  openai?: Partial<AppConfig['openai']>;
  scoring?: Partial<AppConfig['scoring']>;
  profile?: Partial<FitProfile>;
}

export function makeConfig(overrides: ConfigOverrides = {}): AppConfig {
  return {
    cycle: {
      queries: ['backend engineer remote india'],
      score_threshold: 70,
      max_pages_per_query: 1,
      dedup_strategy: 'title_company_via',
      max_job_age_days: 7,
      ...(overrides.cycle ?? {}),
    },
    daemon: {
      poll_interval_seconds: 21600,
      ...(overrides.daemon ?? {}),
    },
    serpapi: {
      country: 'in',
      language: 'en',
      platforms: ['linkedin', 'lever', 'greenhouse'],
      ...(overrides.serpapi ?? {}),
    },
    openai: {
      model: 'gpt-4o-mini',
      llm_concurrency: 2,
      ...(overrides.openai ?? {}),
    },
    scoring: {
      axis_weights: { ...DEFAULT_SCORE_AXIS_WEIGHTS },
      dealbreaker_score_cap: 40,
      recency_full_days: 7,
      recency_decay_days: 60,
      ...(overrides.scoring ?? {}),
    },
    profile: makeProfile(overrides.profile),
  };
}
