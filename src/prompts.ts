import { JsonSchemaSpec } from './adapters/llm';
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

export function buildAnalyzePrompt(posting: RawPosting, descriptionMaxChars: number): string {
  const title = posting.title.trim() || '(missing)';
  const description = posting.description.trim();
  const descBlock =
    description.length > 0 ? description.slice(0, descriptionMaxChars) : '(no description provided)';
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
  descriptionMaxChars: number,
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
${desc.length > 0 ? desc.slice(0, descriptionMaxChars) : '(no description provided)'}

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

// =====================================================================
// Profile extraction — distill a resume into a fit profile.
// =====================================================================

export const PROFILE_EXTRACTION_SYSTEM_PROMPT = `You extract a structured candidate profile from a resume. The output is consumed by an automated job-scorer that compares this profile against postings — so completeness, accuracy, and downstream-friendly normalization all matter.

GROUND RULES
- Extract only what the resume clearly states. Do not infer, embellish, or invent.
- Every string is lowercase. Every list is deduplicated.
- Use empty arrays / empty strings / null when a field has no content — never omit a field, never use placeholders like "n/a" or "unknown".

FIELDS

skills — concrete technologies, languages, frameworks, libraries, databases, tools. Short canonical tokens.
- Include skills from BOTH work experience AND projects AND a dedicated skills section if present.
- Normalize: "Node.js" → "nodejs", "Next.js" → "nextjs", "React.js" → "react", "PostgreSQL" → "postgres", "Amazon Web Services" → "aws". Drop version numbers.
- Keep distinct ecosystem entries that the candidate would expect to be matched on independently (e.g. keep "typescript" AND "javascript", "nestjs" AND "nodejs", "react" AND "nextjs").
- Exclude soft skills, methodologies (agile, scrum), and generic categories ("backend", "databases").
- Aim for completeness — do not truncate arbitrarily.

seniority — one of "junior" | "mid" | "senior" | "staff" | "principal". Empty string if genuinely unclear.
- Base it on years AND scope AND explicit past titles.
- Scope tiebreaker: when years suggest one level but the resume clearly demonstrates the next level up (sole production ownership, multi-service architecture, leading initiatives, measurable impact at scale), pick the higher level.
- Never downgrade an explicit past title — if the candidate held "senior" formally, the value is at least "senior".
- Calibration: 0-2y → junior, 2-5y → mid, 5-8y → senior, 8-11y → staff, 11y+ → principal — then apply the scope tiebreaker.

years_experience — integer years of full-time professional experience.
- Count only post-education paid work.
- Internships count as 0.5x unless the resume explicitly says full-time.
- For overlapping roles, count the calendar span once (do not sum).
- For an in-progress role ("Present"), use elapsed months up to now.
- null if not derivable.

domains — industries or product areas the candidate has worked in (e.g. "fintech", "saas", "b2b-saas", "healthcare", "developer-tools", "logistics", "gtm-automation", "edtech", "ai-infrastructure").
- One token per distinct domain. Use hyphenated forms for multi-word domains.
- Only include domains where the candidate spent meaningful time, not one-off projects.

role_titles — 8 to 12 titles total, used downstream for query generation and role-family matching. Lowercased, normalized, no company names or dates.
- ALWAYS include every distinct past title the candidate has held (e.g. "software engineer", "backend developer intern", "product research intern").
- ALSO include adjacent role-family titles the candidate would credibly apply to based on their stack and scope. For a backend-leaning candidate with Node/NestJS/TypeScript/Python/Postgres/Docker/AWS, that means titles like "backend engineer", "backend developer", "nodejs developer", "nestjs developer", "typescript backend engineer", "python backend engineer", "fullstack engineer", "platform engineer", "api engineer". For a frontend-leaning candidate, mirror this with the frontend equivalents. Do NOT pad with senior-level titles the candidate's years/scope don't support (no "staff engineer" for a 2y candidate).
- The summary line ("backend-focused engineer", "fullstack developer", "platform-leaning generalist") is the primary signal for which role-family to expand into. Pick the family that the resume most clearly demonstrates and expand it; don't expand into multiple unrelated families.

locations — cities, regions, or "remote" the resume mentions as work or residence.
- Use city names ("new delhi", "berlin"), country names where the candidate is generally available ("india"), or "remote".
- Include the candidate's current/home city. Include "remote" only if the resume explicitly demonstrates remote work or stated availability.
- Empty array only if the resume is silent on geography.

work_authorization — list of ISO 3166-1 alpha-2 country codes (lowercase, e.g. "in", "us", "gb", "de") where the candidate has legal work rights without sponsorship. Use only what the resume explicitly states (citizenship, permanent residency, "authorized to work in X", visa status). Empty array if silent.

work_mode_preference — ordered list (most preferred first) drawn from "remote", "hybrid", "onsite". Infer from explicit statements in the resume's summary or work history. If the resume only mentions onsite roles with no preference signal, return empty array.

relocation_open — true only if the resume explicitly says the candidate is open to relocation or willing to move. Otherwise false. Do not infer from the absence of location restrictions.

preferred_company_size — list drawn from "startup", "scaleup", "enterprise". Infer from explicit work history pattern (e.g. 3 consecutive startup roles → ["startup"]; mix of FAANG and series-A → ["scaleup", "enterprise"]). Empty array if the pattern is unclear or single-data-point.

availability — short string describing earliest start (e.g. "immediate", "2 weeks notice", "1 month notice", "after may 2026"). Empty string if not stated.

min_annual_salary — integer only if the resume explicitly states current or target compensation. Use the candidate's local currency (no conversion). Otherwise null.

compensation_currency — ISO 4217 currency code (lowercase, e.g. "inr", "usd", "eur") matching min_annual_salary. Null if min_annual_salary is null.

highlights — 3-7 concise achievements with measurable impact or notable scope.
- Pick the strongest items if the resume contains more than 7 — quality over count.
- Each item: imperative or past-tense verb-led phrase with a metric, scope, or named system. Examples: "scaled api to 10k rps", "led migration from monolith to services", "owns groovo gtm platform end-to-end", "cut p95 query time from 800ms to 200ms".
- Strip personal pronouns and company names; keep numbers and named systems.
- Do not pad with weak items. Empty array if the resume has no distinct achievements.

notes — at most one short sentence summarizing anything distinctive the other fields don't capture.
- Prioritize downstream-relevant context: location/work-mode preferences (e.g. "india-based, open to remote"), role-family orientation (e.g. "backend-leaning generalist"), founder background, open-source maintenance, domain crossover.
- Empty string if nothing notable beyond what other fields already encode.`;

export function buildProfileExtractionPrompt(resumeText: string): string {
  return `RESUME:\n${resumeText}`;
}

export const PROFILE_EXTRACTION_SCHEMA: JsonSchemaSpec = {
  name: 'fit_profile',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'skills',
      'seniority',
      'years_experience',
      'domains',
      'role_titles',
      'locations',
      'work_authorization',
      'work_mode_preference',
      'relocation_open',
      'preferred_company_size',
      'availability',
      'min_annual_salary',
      'compensation_currency',
      'highlights',
      'notes',
    ],
    properties: {
      skills: { type: 'array', items: { type: 'string' } },
      seniority: { type: 'string', enum: ['', 'junior', 'mid', 'senior', 'staff', 'principal'] },
      years_experience: { type: ['integer', 'null'] },
      domains: { type: 'array', items: { type: 'string' } },
      role_titles: { type: 'array', items: { type: 'string' } },
      locations: { type: 'array', items: { type: 'string' } },
      work_authorization: { type: 'array', items: { type: 'string' } },
      work_mode_preference: {
        type: 'array',
        items: { type: 'string', enum: ['remote', 'hybrid', 'onsite'] },
      },
      relocation_open: { type: 'boolean' },
      preferred_company_size: {
        type: 'array',
        items: { type: 'string', enum: ['startup', 'scaleup', 'enterprise'] },
      },
      availability: { type: 'string' },
      min_annual_salary: { type: ['integer', 'null'] },
      compensation_currency: { type: ['string', 'null'] },
      highlights: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
  },
};
