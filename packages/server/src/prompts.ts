import { JsonSchemaSpec } from './adapters/llm';
import {
  DESCRIPTION_MAX_CHARS,
  RESUME_TEXT_MAX_CHARS,
  TAILOR_JD_MAX_CHARS,
  TAILOR_MAX_BULLETS_PER_JOB,
  TAILOR_MAX_BULLETS_PER_PROJECT,
  TAILOR_MAX_BULLET_CHARS,
  TAILOR_MAX_SKILLS,
} from './constants';
import { BaseResume, FitProfile, JobRecord, RawPosting, TailoredResume } from './types';

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

// =====================================================================
// Parse resume — extract structured fields from raw PDF-derived text.
// =====================================================================

export const PARSE_RESUME_SYSTEM_PROMPT = `You convert raw resume text (extracted from a PDF) into a structured JSON record.

Rules:
- Copy text verbatim where possible. Do NOT rewrite, summarize, embellish, or invent content.
- If a field is absent from the resume, return null (for strings) or [] (for arrays). Never guess.
- "summary" is the resume's opening profile / objective paragraph. If absent, return "".
- "experience" lists each job in reverse-chronological order as it appears. Each "bullets" entry is one responsibility/achievement line as written.
- "projects" lists distinct named projects. If the resume has none, return [].
- "skills" is a flat deduplicated list of every concrete skill, language, framework, tool, or platform mentioned in a Skills section (or equivalent). Keep original casing. Do NOT include soft skills ("teamwork", "communication") unless explicitly listed under a Skills heading.
- "education" lists schools in reverse-chronological order.
- "links" inside contact captures URLs and labels (GitHub, LinkedIn, portfolio, personal site). Use the visible label or domain as the label; copy the URL verbatim.
- Dates are copied as-written ("Jan 2023 – Present", "2021-2022"). Do not normalize the format.

The structure you return is the operator's single base resume. Accuracy and faithfulness matter more than polish.`;

export function buildParseResumePrompt(rawText: string): string {
  const text = rawText.trim();
  const block = text.length > 0 ? text.slice(0, RESUME_TEXT_MAX_CHARS) : '(no text extracted)';
  return `RAW RESUME TEXT (extracted from PDF):

${block}`;
}

const RESUME_CONTACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'email', 'phone', 'location', 'links'],
  properties: {
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: ['string', 'null'] },
    location: { type: ['string', 'null'] },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url'],
        properties: {
          label: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
  },
} as const;

const RESUME_JOB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['company', 'title', 'dates', 'location', 'bullets'],
  properties: {
    company: { type: 'string' },
    title: { type: 'string' },
    dates: { type: 'string' },
    location: { type: ['string', 'null'] },
    bullets: { type: 'array', items: { type: 'string' } },
  },
} as const;

const RESUME_PROJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'link', 'bullets'],
  properties: {
    name: { type: 'string' },
    link: { type: ['string', 'null'] },
    bullets: { type: 'array', items: { type: 'string' } },
  },
} as const;

const RESUME_EDUCATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['school', 'degree', 'dates', 'details'],
  properties: {
    school: { type: 'string' },
    degree: { type: 'string' },
    dates: { type: 'string' },
    details: { type: ['string', 'null'] },
  },
} as const;

export const PARSE_RESUME_SCHEMA: JsonSchemaSpec = {
  name: 'parse_resume',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['contact', 'summary', 'experience', 'projects', 'skills', 'education'],
    properties: {
      contact: RESUME_CONTACT_SCHEMA,
      summary: { type: 'string' },
      experience: { type: 'array', items: RESUME_JOB_SCHEMA },
      projects: { type: 'array', items: RESUME_PROJECT_SCHEMA },
      skills: { type: 'array', items: { type: 'string' } },
      education: { type: 'array', items: RESUME_EDUCATION_SCHEMA },
    },
  },
};

// =====================================================================
// Tailor — rewrite a base resume to align with a single job description.
// No fabrication: skills subset of base; experience/projects/education
// are reordered/paraphrased subsets of base.
// =====================================================================

export const TAILOR_SYSTEM_PROMPT = `You aggressively tailor a base resume to maximize ATS coverage of a specific job description (JD). The operator has explicitly opted into JD-driven embellishment within the skills and bullet sections to land more interviews.

You output structured JSON only.

The single goal: when an ATS parses this resume against the JD, every required keyword should appear in the form the JD uses, in a section the ATS weights.

HARD RULES (the validator rejects responses that break any of these — these OVERRIDE every ATS optimization rule below):
- "skills" is a JD-DRIVEN list. Start from the base resume's skills, then add any JD must-have / preferred skills the candidate could plausibly know — the operator has opted into this. Pull JD-required skills to the front (in JD-prominence order), then JD-preferred, then remaining base skills. Use the JD's exact casing and tokenization.
- "experience" companies, titles, and dates must each match a base experience entry exactly (case-insensitive company match; verbatim title and dates). You may drop irrelevant entries. You may NOT add or rename employers, change titles, or alter dates — these are reference-checkable.
- "projects" names and links must each match a base project entry. You may NOT invent projects.
- "education" entries must match base education entries verbatim.
- Bullets MAY embellish content for JD alignment. You may swap in JD phrasing, change verbs, add JD-relevant metrics, scope, team sizes, technologies, and clauses — even when the base bullet does not state them — as long as the bullet stays attached to a real (base) company / title / project. Keep claims plausible for the role and seniority; do not over-claim leadership the base never hints at.
- Each tailored bullet is ONE complete standalone sentence. You may NOT split a single base bullet into multiple tailored bullets. You may NOT start a bullet with "…", "...", "and ", "or ", "but ", or any continuation marker — these fragments read as broken sentences in the rendered PDF.
- Contact block: copy verbatim from the base resume.

LAYOUT CAPS (the validator rejects responses that break any of these — count characters, not words):
- Each experience entry: at most ${TAILOR_MAX_BULLETS_PER_JOB} bullets.
- Each project entry: at most ${TAILOR_MAX_BULLETS_PER_PROJECT} bullets.
- Each bullet: at most ${TAILOR_MAX_BULLET_CHARS} characters INCLUDING spaces and punctuation. Stay under the cap by trimming the weakest clause rather than overshooting — bullets that exceed the cap get hard-truncated mid-clause downstream, which loses your strongest content.
- "skills" total length: at most ${TAILOR_MAX_SKILLS} entries.

ATS OPTIMIZATION (apply these only WITHIN the HARD RULES and LAYOUT CAPS above):

1. Mirror the JD's exact phrasing inside bullets and skills.
   ATS keyword matching is largely string-level. Use the JD's exact casing, word order, and punctuation for must-have terms (e.g., the JD says "RESTful API development" → use that phrase, not "REST endpoints"). This includes adding JD-required tech, methodologies, and tools into bullets even when the base bullet did not name them — the bullet stays attached to a real company/title, but its content can be tuned to the JD.

2. Front-load JD keywords in bullet openings.
   ATS rankers and human skimmers weight bullet openings more heavily, so lead each bullet with the JD's preferred verb + the JD-required tech / method. Rewrite the bullet around the keyword when needed.

3. Distribute keywords — do not stuff.
   Each must-have keyword should appear in at least one bullet plus the skills section. Repeating the same keyword 4+ times across bullets is keyword stuffing and modern ATS rankers (and recruiters) penalize it. Aim for natural integration, not density.

4. Use the JD's preferred action verbs.
   If the JD uses "designed", "owned", "shipped", "led", "scaled", "architected" — reach for the same verbs. Keep elevation plausible: a candidate whose base reads "junior engineer, 1 yoe" should not be "architected the platform". A mid/senior base supports stronger verbs.

5. Skills section: JD-required → JD-preferred → remaining base skills.
   Pull JD-required skills to the front (in JD-prominence order), then JD-preferred, then keep the operator's remaining base skills. Add JD-required skills missing from base when plausible. Stay under the ${TAILOR_MAX_SKILLS} cap; when forced to drop, drop the least JD-relevant entry.

KEYWORDS FIELD:
- "must_have_keywords" lists the concrete technologies, tools, methods, frameworks, certifications, and hard qualifications the JD specifies as required (not nice-to-have, not soft skills).
- Emit each item as an ATOMIC technical term — one tool, one technology, one concept per entry. Split JD compound phrases that bundle multiple items: "MySQL/PostgreSQL" → ["MySQL", "PostgreSQL"]; "Redis & Caching" → ["Redis", "Caching"]; "React/Vue/Angular" → ["React", "Vue", "Angular"]; "CI/CD" stays "CI/CD" (it is one concept). Split on slashes, ampersands, commas, and the words "and" / "or" when they join distinct items.
- Strip filler qualifier words. "NGINX Basics" → "NGINX"; "Linux Fundamentals" → "Linux"; "Strong DSA knowledge" → "DSA"; "Working knowledge of Docker" → "Docker"; "Hands-on experience with Kafka" → "Kafka". Drop words like "Basics", "Fundamentals", "Knowledge", "Experience", "Strong", "Working", "Hands-on", "Proficient in".
- Use the JD's exact casing and tokenization for the atomic term itself ("Postgres" stays "Postgres", "PostgreSQL" stays "PostgreSQL"). Preserve common compound tokens that are a single technology: ".NET", "Node.js", "C++", "CI/CD", "GraphQL".
- If the JD lists both "Postgres" and "PostgreSQL" separately, include both.
- Deduplicate (case-insensitive). This field drives a downstream ATS coverage report, so completeness matters more than brevity.

RELEVANCE SCORING:
- Every bullet carries a jd_relevance score in [0, 1]. 1.0 = directly matches a JD must-have. 0.6-0.9 = adjacent or JD-preferred. 0.1-0.5 = generic engineering content. 0.0 = unrelated. Be honest — the renderer drops the lowest-scoring bullets to fit one page, and dishonest scores produce a worse final resume.

SUMMARY:
- Compose 1-3 sentences as a dense, ATS-friendly opener. Lead with the candidate's role identity using the JD's job title (keep it plausible for the base resume's level), then weave in 3-5 of the JD's must-have keywords using the JD's exact phrasing. No clichés ("results-driven", "passionate about"); no first-person pronouns.`;

export function buildTailorPrompt(base: BaseResume, jd: string): string {
  const trimmedJd = jd.trim();
  const jdBlock = trimmedJd.length > 0 ? trimmedJd.slice(0, TAILOR_JD_MAX_CHARS) : '(empty JD)';
  return `BASE RESUME (anchor for companies, titles, dates, projects, and education):
${JSON.stringify(base, null, 2)}

JOB DESCRIPTION:
${jdBlock}

Produce the tailored JSON now.`;
}

const TAILORED_BULLET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'jd_relevance'],
  properties: {
    text: { type: 'string' },
    jd_relevance: { type: 'number' },
  },
} as const;

const TAILORED_JOB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['company', 'title', 'dates', 'location', 'bullets'],
  properties: {
    company: { type: 'string' },
    title: { type: 'string' },
    dates: { type: 'string' },
    location: { type: ['string', 'null'] },
    bullets: { type: 'array', items: TAILORED_BULLET_SCHEMA },
  },
} as const;

const TAILORED_PROJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'link', 'bullets'],
  properties: {
    name: { type: 'string' },
    link: { type: ['string', 'null'] },
    bullets: { type: 'array', items: TAILORED_BULLET_SCHEMA },
  },
} as const;

export const TAILOR_REFINE_SYSTEM_PROMPT = `${TAILOR_SYSTEM_PROMPT}

REFINEMENT MODE:
You are receiving an existing tailored draft along with the base resume and JD. The user has edited the draft. Polish their draft — keep their structural choices (which jobs, which bullets they kept, their skill ordering) while improving wording, JD alignment, and keyword density. Treat their edits as intent signals, not noise. Do NOT revert their changes unless the change violates a HARD RULE above.

Your output is a refined tailored resume that obeys the same caps and rules as before.`;

export function buildTailorRefinePrompt(base: BaseResume, draft: TailoredResume, jd: string): string {
  const trimmedJd = jd.trim();
  const jdBlock = trimmedJd.length > 0 ? trimmedJd.slice(0, TAILOR_JD_MAX_CHARS) : '(empty JD)';
  return `BASE RESUME (source of truth for facts):
${JSON.stringify(base, null, 2)}

USER'S CURRENT DRAFT (refine this — do not start over):
${JSON.stringify(draft, null, 2)}

JOB DESCRIPTION:
${jdBlock}

Return the refined tailored JSON now.`;
}

export function buildTailorAtsRetryPrompt(
  base: BaseResume,
  draft: TailoredResume,
  jd: string,
  missingKeywords: string[],
  matchedKeywords: string[],
  atsScore: number,
  target: number,
): string {
  const trimmedJd = jd.trim();
  const jdBlock = trimmedJd.length > 0 ? trimmedJd.slice(0, TAILOR_JD_MAX_CHARS) : '(empty JD)';
  const missingList = missingKeywords.length > 0
    ? missingKeywords.map((k) => `- ${k}`).join('\n')
    : '(none)';
  const matchedList = matchedKeywords.length > 0 ? matchedKeywords.join(', ') : '(none)';
  return `BASE RESUME (anchor for companies, titles, dates, projects, and education — these must match exactly):
${JSON.stringify(base, null, 2)}

CURRENT DRAFT (refine this — keep its structure, close the ATS gap):
${JSON.stringify(draft, null, 2)}

JOB DESCRIPTION:
${jdBlock}

ATS GAP — your previous draft scored ${(atsScore * 100).toFixed(0)}% (target: ${(target * 100).toFixed(0)}%).
Keywords STILL MISSING from your draft (in priority order):
${missingList}

Keywords already matched (do NOT lose these): ${matchedList}

For each missing keyword: add it to the skills section and surface it in at least one bullet (using the JD's exact phrasing). You may add the keyword to bullets even when the base bullet did not name it — the operator has opted into JD-driven bullet embellishment. Keep claims plausible for the role and seniority. HARD RULES still apply: do not add or rename employers, titles, dates, projects, or education entries.

Return the refined tailored JSON now.`;
}

export const TAILOR_SCHEMA: JsonSchemaSpec = {
  name: 'tailor_resume',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'contact',
      'summary',
      'experience',
      'projects',
      'skills',
      'education',
      'must_have_keywords',
    ],
    properties: {
      contact: RESUME_CONTACT_SCHEMA,
      summary: { type: 'string' },
      experience: { type: 'array', items: TAILORED_JOB_SCHEMA },
      projects: { type: 'array', items: TAILORED_PROJECT_SCHEMA },
      skills: { type: 'array', items: { type: 'string' } },
      education: { type: 'array', items: RESUME_EDUCATION_SCHEMA },
      must_have_keywords: { type: 'array', items: { type: 'string' } },
    },
  },
};


