import { BaseResume, FitProfile, JobRecord, RawPosting, TailoredResume } from '../../src/types';
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
  server?: Partial<AppConfig['server']>;
  serpapi?: Partial<AppConfig['serpapi']>;
  openai?: Partial<AppConfig['openai']>;
  scoring?: Partial<AppConfig['scoring']>;
  profile?: Partial<FitProfile>;
  secrets?: Partial<AppConfig['secrets']>;
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
    server: {
      poll_interval_seconds: 21600,
      http_port: 8787,
      ...(overrides.server ?? {}),
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
    secrets: {
      serpapi_keys: ['test-serpapi-key'],
      openai_key: 'test-openai-key',
      ...(overrides.secrets ?? {}),
    },
  };
}

export function makeBaseResume(overrides: Partial<BaseResume> = {}): BaseResume {
  return {
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+91 90000 00000',
      location: 'Bengaluru, India',
      links: [{ label: 'GitHub', url: 'https://github.com/jane' }],
    },
    summary: 'Backend engineer with 4 years building distributed services.',
    experience: [
      {
        company: 'Acme',
        title: 'Senior Backend Engineer',
        dates: 'Jan 2023 – Present',
        location: 'Remote',
        bullets: [
          'Led migration from monolith to microservices on Kubernetes.',
          'Reduced p99 latency by 40% by introducing Redis caching tier.',
          'Mentored 3 mid-level engineers on event-driven architecture.',
        ],
      },
      {
        company: 'Globex',
        title: 'Software Engineer',
        dates: '2020 – 2022',
        location: 'Bengaluru',
        bullets: [
          'Built REST APIs serving 2M requests/day on Node.js + Postgres.',
          'Owned CI/CD pipeline migration to GitHub Actions.',
        ],
      },
    ],
    projects: [
      {
        name: 'OpenRails',
        link: 'https://github.com/jane/openrails',
        bullets: ['CLI tool for railway timetables, 1k stars on GitHub.'],
      },
    ],
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Kubernetes', 'AWS', 'GraphQL'],
    education: [
      {
        school: 'IIT Bombay',
        degree: 'B.Tech Computer Science',
        dates: '2016 – 2020',
        details: 'GPA 8.9/10',
      },
    ],
    source_pdf_name: 'jane_doe_resume.pdf',
    parsed_at: '12/06/2026',
    ...overrides,
  };
}

export function makeTailoredResume(overrides: Partial<TailoredResume> = {}): TailoredResume {
  return {
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+91 90000 00000',
      location: 'Bengaluru, India',
      links: [{ label: 'GitHub', url: 'https://github.com/jane' }],
    },
    summary: 'Backend engineer specializing in Node.js APIs and distributed systems.',
    experience: [
      {
        company: 'Acme',
        title: 'Senior Backend Engineer',
        dates: 'Jan 2023 – Present',
        location: 'Remote',
        bullets: [
          { text: 'Led microservices migration on Kubernetes.', jd_relevance: 0.9 },
          { text: 'Cut p99 latency 40% via Redis caching.', jd_relevance: 0.7 },
          { text: 'Mentored 3 engineers on event-driven design.', jd_relevance: 0.3 },
        ],
      },
    ],
    projects: [],
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Kubernetes'],
    education: [
      { school: 'IIT Bombay', degree: 'B.Tech Computer Science', dates: '2016 – 2020', details: 'GPA 8.9/10' },
    ],
    must_have_keywords: ['Node.js', 'Kubernetes'],
    ...overrides,
  };
}
