export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type JobStatus = 'new' | 'reviewed' | 'applied' | 'filtered';

export type ScoreAxis =
  | 'skills_match'
  | 'seniority_match'
  | 'location_match'
  | 'comp_match'
  | 'domain_match'
  | 'recency';

export interface AxisScore {
  score: number;
  note: string;
}

export interface ScoreBreakdown {
  axes: Record<ScoreAxis, AxisScore>;
  final_score: number;
  confidence: 'low' | 'medium' | 'high';
  deal_breakers: string[];
  rationale: string;
}

export interface JobRecord {
  job_id: string;
  title: string;
  company: string;
  location: string;
  work_mode: WorkMode;
  salary_min: number | null;
  salary_max: number | null;
  seniority: string | null;
  source: string;
  apply_url: string;
  posted_date: string | null;
  score: number;
  rationale: string;
  breakdown: string | null;
  status: JobStatus;
  first_seen: string;
  last_seen: string;
}

export type CompanySize = 'startup' | 'scaleup' | 'enterprise';
export type WorkModePreference = 'remote' | 'hybrid' | 'onsite';

export interface FitProfile {
  skills: string[];
  seniority: string;
  years_experience: number | null;
  domains: string[];
  role_titles: string[];
  locations: string[];
  work_authorization: string[];
  work_mode_preference: WorkModePreference[];
  relocation_open: boolean;
  preferred_company_size: CompanySize[];
  availability: string;
  min_annual_salary: number | null;
  compensation_currency: string | null;
  highlights: string[];
  notes: string;
}

export type DedupStrategy = 'title_company_via' | 'title_company';

export interface SelfTestStep {
  check: string;
  ok: boolean;
  detail: string;
}

export interface RawPosting {
  title: string;
  company: string;
  location: string;
  via: string;
  apply_link: string;
  description: string;
  salary: string | null;
  schedule: string | null;
  posted_at: string | null;
}

