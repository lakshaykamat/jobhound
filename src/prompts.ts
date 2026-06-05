import { JsonSchemaSpec } from './adapters/llm';
import { DESCRIPTION_MAX_CHARS } from './constants';
import { FitProfile, JobRecord, RawPosting } from './types';

// =====================================================================
// Analyze — normalize loose posting fields when regex heuristics fail.
// =====================================================================

export const ANALYZE_SYSTEM_PROMPT = `You normalize two fields from a job posting: work_mode and seniority.

The pipeline already tried regex on obvious keywords ("remote", "senior", etc.) and failed — that is why you are being called. So treat the posting as ambiguous and only commit to a value when the description provides clear evidence. Otherwise return null. Over-confident inference here directly degrades downstream scoring.

WORK_MODE
- "remote": the role is performed remotely as the default arrangement. Phrases like "fully remote", "work from anywhere", "100% remote", or "remote-first" qualify. "Remote (US only)" is still "remote" — geographic restriction does not change the mode.
- "hybrid": the role mixes onsite and remote on a scheduled basis (e.g. "3 days in office", "hybrid 2/3", "in office Tue-Thu").
- "onsite": the role is performed at a specific location with no remote provision.
- null: the posting is ambiguous, contradictory, or does not say. "Remote-friendly", "remote possible for the right candidate", "occasional remote work", "open to remote" without commitment, or no signal at all → null.

SENIORITY
Infer from the description's stated experience requirement and scope expectations, NOT the title alone (the title already failed keyword matching upstream).
- intern: explicit internship language, currently-enrolled requirement, or 0 years required.
- junior: 1-2 years required, "early career", "new grad considered", entry-level scope.
- mid: 3-5 years required, "intermediate", expected to ship features independently.
- senior: 5-8 years required, "experienced", expected to own systems and mentor.
- lead: 8+ years AND explicit team-lead / tech-lead responsibility.
- principal: explicit "staff", "principal", or "distinguished" framing with strategic / cross-team scope.
- null: no years stated and no scope signals — do not guess from a generic "Software Engineer" title.

Pick the closest single value. Do not split across categories. Prefer null over a low-confidence guess.`;

export function buildAnalyzePrompt(posting: RawPosting): string {
  const title = posting.title.trim() || '(missing)';
  const description = posting.description.trim();
  const descBlock =
    description.length > 0 ? description.slice(0, DESCRIPTION_MAX_CHARS) : '(no description provided)';
  const location = posting.location.trim();

  return `Title: ${title}${location ? `\nLocation: ${location}` : ''}

Description:
${descBlock}`;
}

export const ANALYZE_SCHEMA: JsonSchemaSpec = {
  name: 'analyze_posting',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['work_mode', 'seniority'],
    properties: {
      work_mode: { type: ['string', 'null'], enum: ['remote', 'hybrid', 'onsite', null] },
      seniority: {
        type: ['string', 'null'],
        enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', null],
      },
    },
  },
};

// =====================================================================
// Score — judge fit across six axes and produce a final weighted score.
// =====================================================================

export const SCORE_SYSTEM_PROMPT = `You are a triage scorer for a job-search pipeline.

CONTEXT
The pipeline stores job postings in a spreadsheet for a human to review later. They — not you — decide whether to apply. Your job is to score how worthwhile it is for them to open this posting. A high score means "this is worth their 30 seconds." A low score means "skip it, it's a poor match." Below a configured threshold the posting is flagged 'filtered' and hidden from their working view.

Be calibrated and strict — the human's time is the scarce resource, so prefer false negatives (low score on a maybe-okay job) over false positives (high score on a bad fit).

AXES (each an integer 0-100):

- skills_match: overlap between the candidate's stack and the posting's stated technical requirements, factoring role family.
  • Exact tech match → 90-100 (e.g. "nestjs" → nestjs posting).
  • Same stack family → 70-85 (e.g. nestjs ↔ express, postgres ↔ mysql, redis ↔ memcached, react ↔ next, django ↔ flask). Most candidates with one map cleanly to the other in real hiring.
  • Adjacent ecosystem → 45-65 (e.g. node ↔ python backend, react ↔ vue).
  • Stack largely unstated in posting ("modern backend stack", "any major language") → 70 default.
  • Stack explicitly required and absent from profile → ≤30.
  • Role family mismatch (candidate's preferred role titles are backend-leaning but posting is frontend / ML / data / mobile, or vice versa) → cap skills_match at 40 regardless of incidental tech overlap, and surface in deal_breakers. Fullstack postings do NOT trigger this cap for backend- or frontend-leaning candidates.

- seniority_match: alignment between the candidate's seniority/years and the posting's level.
  • Same level → 90-100.
  • Off by one level → 55-70 baseline.
  • Off by two or more → ≤30. Intern/junior applied to senior+ → ≤20.
  • Scope tiebreaker: if years place the candidate 1-2 levels below the posting BUT profile 'highlights' show comparable scope (production ownership, multi-service architecture, measurable impact at scale, leading initiatives), add +15-25 to the baseline. Cite the specific highlight in the note.
  • Posting does not state a level → 70 default; do not guess from title alone unless the title contains "senior", "staff", "principal", "lead", "intern", or "junior".

- location_match: alignment of posting's work_mode + physical location with the candidate's preferences. Use 'work_mode_preference', 'locations', 'work_authorization', and 'relocation_open' from the profile.
  • Posting work_mode is in candidate's work_mode_preference AND no region restriction excludes them → 100 (favor earlier entries in the preference list more strongly).
  • Posting requires work authorization the candidate lacks. Treat "remote (US only)", "must have right to work in EU", "citizenship required", visa-sponsorship-not-offered as authorization restrictions. If candidate's 'work_authorization' does not include the required country/region → ≤20 AND add to deal_breakers (e.g. "remote US-only, candidate authorized in IN"). This is the most common false positive — flag it aggressively.
  • Posting work_mode is NOT in candidate's work_mode_preference (e.g. onsite when candidate prefers remote only) → ≤30 unless mitigated below.
  • Hybrid/onsite in a candidate-listed city → 70-90.
  • Onsite outside listed cities BUT candidate has 'relocation_open' = true → 50-70 (do not penalize as harshly).
  • Onsite outside listed cities AND 'relocation_open' = false → ≤20.
  • Candidate lists no locations AND no work_mode_preference → 70 (unknown preference).

- comp_match: aligns posted compensation with candidate's 'min_annual_salary' (in their 'compensation_currency').
  • Same currency, posted ≥ floor → 100.
  • Same currency, posted within 80-100% of floor → 60-80.
  • Same currency, posted < 80% of floor → ≤30.
  • Different currency or unclear units → 60 (cannot compare reliably; do not penalize hard).
  • Salary unpublished → 70 (unknown is not a disqualifier — many real postings hide it).
  • Candidate has no floor set (min_annual_salary is null) → 70.

- domain_match: overlap between the posting's industry/product domain and the candidate's domains.
  • Exact match → 90-100.
  • Adjacent industry → 55-70.
  • Domain-agnostic posting (generic SWE role where the work does not depend on industry knowledge — most backend, infra, platform, devtools roles) → 65-75 default, even if candidate's domains don't overlap. Generalist engineers should not be penalized here.
  • Domain-specific posting requiring background (fintech demanding finance/compliance experience, healthcare demanding HIPAA, gov demanding clearance, gaming demanding game-engine work) AND candidate lacks it → ≤30.

(Recency is computed deterministically from the posted date — do not score it.)

EVIDENCE RULES
- Each axis 'note' is a non-empty string of ≤8 words referencing specific evidence from the posting or profile. No generic phrases like "good match" or "fits well".
- Each axis 'score' is an integer in 0-100.
- Never invent qualifications the posting does not state. If the posting only says "modern web stack", do not assume react.
- Vague, marketing-heavy, or content-light descriptions reduce confidence — set confidence="low" and bias all axis scores downward.
- 'deal_breakers' is a list of concrete concerns to surface to the human. Examples: "requires 10y exp, candidate has 3", "remote US-only, candidate India", "frontend role, candidate backend-leaning", "requires security clearance", "visa sponsorship not offered". These are flags, not rejections — the human still decides. The pipeline applies a numerical cap when this list is non-empty.
- 'rationale' is 1-2 sentences citing specific evidence from posting and profile.

MISSING SIGNALS
Profile and posting fields may be null, empty, "(none)", "(unspecified)", or "unknown". This means "no information", NOT "negative information". Rules:
- Absence of information by itself never drops a score below the default for that axis. Only an explicit conflict can.
- When a needed field is missing on EITHER side, fall back to that axis's "unknown" or "default" branch (e.g. 70 for an undeclared comp floor, undeclared seniority, or domain-agnostic posting), set confidence="low" for the overall scoring, and say so in the axis note (e.g. "candidate seniority unstated").
- Do not invent values for missing fields. Do not penalize for absence.`;

const SCORE_AXIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'note'],
  properties: {
    score: { type: 'integer' },
    note: { type: 'string' },
  },
} as const;

export const SCORE_SCHEMA: JsonSchemaSpec = {
  name: 'score_posting',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['axes', 'confidence', 'deal_breakers', 'rationale'],
    properties: {
      axes: {
        type: 'object',
        additionalProperties: false,
        required: [
          'skills_match',
          'seniority_match',
          'location_match',
          'comp_match',
          'domain_match',
        ],
        properties: {
          skills_match: SCORE_AXIS_SCHEMA,
          seniority_match: SCORE_AXIS_SCHEMA,
          location_match: SCORE_AXIS_SCHEMA,
          comp_match: SCORE_AXIS_SCHEMA,
          domain_match: SCORE_AXIS_SCHEMA,
        },
      },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      deal_breakers: { type: 'array', items: { type: 'string' } },
      rationale: { type: 'string' },
    },
  },
};

export function buildScorePrompt(
  record: JobRecord,
  description: string,
  profile: FitProfile,
): string {
  const postedAge = ageInDays(record.posted_date);
  const highlights = profile.highlights?.length
    ? profile.highlights.map((h) => `   • ${h}`).join('\n')
    : '   (none)';
  const desc = description.trim();

  return `CANDIDATE PROFILE
─ Skills: ${formatList(profile.skills)}
─ Seniority: ${formatString(profile.seniority)}
─ Years of experience: ${formatNumber(profile.years_experience)}
─ Domains: ${formatList(profile.domains)}
─ Preferred role titles: ${formatList(profile.role_titles)}
─ Preferred locations: ${formatList(profile.locations)}
─ Work authorization: ${formatList(profile.work_authorization)}
─ Work mode preference: ${formatList(profile.work_mode_preference)}
─ Open to relocation: ${profile.relocation_open ? 'yes' : 'no'}
─ Preferred company size: ${formatList(profile.preferred_company_size)}
─ Availability: ${formatString(profile.availability)}
─ Minimum annual salary: ${formatProfileSalary(profile.min_annual_salary, profile.compensation_currency)}
─ Highlights:
${highlights}
─ Notes: ${formatString(profile.notes, '(none)')}

JOB POSTING
─ Title: ${formatString(record.title)}
─ Company: ${formatString(record.company)}
─ Location: ${formatString(record.location)}
─ Work mode: ${record.work_mode === 'unknown' ? '(unspecified)' : record.work_mode}
─ Seniority signal: ${formatString(record.seniority)}
─ Salary: ${formatSalary(record)}
─ Posted: ${formatPosted(record.posted_date, postedAge)}
─ Source: ${formatString(record.source)}

DESCRIPTION
${desc.length > 0 ? desc.slice(0, DESCRIPTION_MAX_CHARS) : '(no description provided)'}

Score this job across all six axes and produce final_score.`;
}

function formatList(items: string[] | null | undefined): string {
  return items && items.length ? items.join(', ') : '(none)';
}

function formatString(s: string | null | undefined, empty = '(unspecified)'): string {
  if (s == null) return empty;
  const t = String(s).trim();
  return t.length > 0 ? t : empty;
}

function formatNumber(n: number | null | undefined): string {
  return n == null ? '(unspecified)' : String(n);
}

function formatProfileSalary(min: number | null, currency: string | null): string {
  if (min == null) return '(unspecified)';
  return currency ? `${min} ${currency}` : String(min);
}

function formatSalary(r: JobRecord): string {
  if (r.salary_min == null && r.salary_max == null) return 'not published';
  if (r.salary_min != null && r.salary_max != null) return `${r.salary_min}–${r.salary_max}`;
  return String(r.salary_min ?? r.salary_max);
}

function ageInDays(postedDate: string | null): number | null {
  if (!postedDate) return null;
  const posted = Date.parse(postedDate);
  if (!Number.isFinite(posted)) return null;
  return Math.max(0, Math.floor((Date.now() - posted) / 86_400_000));
}

function formatPosted(postedDate: string | null, ageDays: number | null): string {
  if (!postedDate) return 'unknown';
  if (ageDays == null) return postedDate;
  return `${postedDate} (${ageDays} day${ageDays === 1 ? '' : 's'} ago)`;
}

