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

// =====================================================================
// Resume (base + tailored)
// =====================================================================

export interface ContactLink {
  label: string;
  url: string;
}

export interface ContactBlock {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  links: ContactLink[];
}

export interface ResumeJob {
  company: string;
  title: string;
  dates: string;
  location: string | null;
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  link: string | null;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  dates: string;
  details: string | null;
}

export interface BaseResume {
  contact: ContactBlock;
  summary: string;
  experience: ResumeJob[];
  projects: ResumeProject[];
  skills: string[];
  education: ResumeEducation[];
  source_pdf_name: string;
  parsed_at: string;
}

// =====================================================================
// Tailor — per-JD output. Mirrors BaseResume but every bullet carries
// a jd_relevance score the renderer uses for one-page drops.
// =====================================================================

export interface TailoredBullet {
  text: string;
  jd_relevance: number;
}

export interface TailoredJob {
  company: string;
  title: string;
  dates: string;
  location: string | null;
  bullets: TailoredBullet[];
}

export interface TailoredProject {
  name: string;
  link: string | null;
  bullets: TailoredBullet[];
}

export interface TailoredResume {
  contact: ContactBlock;
  summary: string;
  experience: TailoredJob[];
  projects: TailoredProject[];
  skills: string[];
  education: ResumeEducation[];
  must_have_keywords: string[];
}

export type BulletSection = 'experience' | 'projects';

export interface DroppedBullet {
  section: BulletSection;
  section_index: number;
  bullet_text: string;
  reason: 'one-page-fit';
}

export interface KeywordScore {
  matched: string[];
  missing: string[];
  score: number;
}

export interface TailorResult {
  base: BaseResume;
  tailored: TailoredResume;
  dropped_bullets: DroppedBullet[];
  ats: KeywordScore;
  ats_base: KeywordScore;
  tokens: number;
  cost_usd: number;
  truncation_warning: boolean;
}

