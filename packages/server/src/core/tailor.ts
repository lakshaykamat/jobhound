import { chat } from '../adapters/llm';
import { Logger, logger as rootLogger } from '../logger';
import { costUsd } from '../pricing';
import {
  TAILOR_ATS_MAX_RETRIES,
  TAILOR_ATS_TARGET,
  TAILOR_MAX_BULLET_CHARS,
  TAILOR_MAX_SKILLS,
  TAILOR_MAX_TOKENS,
} from '../constants';
import {
  TAILOR_REFINE_SYSTEM_PROMPT,
  TAILOR_SCHEMA,
  TAILOR_SYSTEM_PROMPT,
  buildTailorAtsRetryPrompt,
  buildTailorPrompt,
} from '../prompts';
import { BaseResume, KeywordScore, TailorPatch, TailorPatchPlan, TailorResult } from '../types';
import { scoreKeywords, scoreKeywordsBase } from './keyword-score';

export class TailorValidationError extends Error {
  constructor(public violations: string[]) {
    super(`tailor response violated ${violations.length} rule${violations.length === 1 ? '' : 's'}`);
    this.name = 'TailorValidationError';
  }
}

export interface TailorOptions {
  base: BaseResume;
  jd: string;
  apiKey: string;
  model: string | undefined;
  log?: Logger;
}

export async function tailorResume(opts: TailorOptions): Promise<TailorResult> {
  const log = opts.log ?? rootLogger;

  log.debug('tailor start', {
    mode: 'patch',
    model: opts.model ?? '(default)',
    jd_chars: opts.jd.length,
    base_skills: opts.base.skills.length,
    base_experience: opts.base.experience.length,
    base_projects: opts.base.projects.length,
  });

  let pass = await runTailorPass(opts, opts.base, TAILOR_SYSTEM_PROMPT, buildTailorPrompt(opts.base, opts.jd), 0, log);
  let totalTokens = pass.tokens;
  const appliedPatches = [...pass.patches];

  for (let retry = 1; retry <= TAILOR_ATS_MAX_RETRIES && pass.ats.score < TAILOR_ATS_TARGET; retry++) {
    const retryPrompt = buildTailorAtsRetryPrompt(
      pass.updated,
      opts.jd,
      pass.ats.missing,
      pass.ats.matched,
      pass.ats.score,
      TAILOR_ATS_TARGET,
    );
    log.info('tailor ats below target; retrying', {
      retry,
      score: pass.ats.score,
      target: TAILOR_ATS_TARGET,
      missing: pass.ats.missing,
    });

    const refined = await runTailorPass(opts, pass.updated, TAILOR_REFINE_SYSTEM_PROMPT, retryPrompt, totalTokens, log);
    totalTokens += refined.tokens;

    if (refined.ats.score <= pass.ats.score) {
      log.info('tailor ats retry plateaued; accepting previous patch set', {
        retry,
        prev_score: pass.ats.score,
        refined_score: refined.ats.score,
      });
      break;
    }

    pass = refined;
    appliedPatches.push(...refined.patches);
  }

  log.info('tailor accepted', {
    mode: 'patch',
    tokens: totalTokens,
    patches: appliedPatches.length,
    ats_score_base: pass.atsBase.score,
    ats_score_tailored: pass.ats.score,
    ats_target: TAILOR_ATS_TARGET,
    ats_missing: pass.ats.missing.length,
  });

  return {
    base: opts.base,
    updated: pass.updated,
    patches: appliedPatches,
    must_have_keywords: pass.mustHaveKeywords,
    ats: pass.ats,
    ats_base: pass.atsBase,
    tokens: totalTokens,
    cost_usd: roundCost(costUsd(opts.model ?? 'gpt-5.2', totalTokens)),
  };
}

interface TailorPass {
  updated: BaseResume;
  patches: TailorPatch[];
  mustHaveKeywords: string[];
  ats: KeywordScore;
  atsBase: KeywordScore;
  tokens: number;
}

interface RawTailorPatch {
  op: TailorPatch['op'];
  reason: string;
  old_text: string | null;
  new_text: string | null;
  old_skills: string[];
  new_skills: string[];
  company: string | null;
  title: string | null;
  dates: string | null;
  project: string | null;
  bullet_index: number | null;
  jd_relevance: number | null;
}

interface RawTailorPatchPlan {
  patches: RawTailorPatch[];
  must_have_keywords: string[];
}

async function runTailorPass(
  opts: TailorOptions,
  current: BaseResume,
  systemPrompt: string,
  basePrompt: string,
  priorTokens: number,
  log: Logger,
): Promise<TailorPass> {
  let attempt = 0;
  let lastViolations: string[] = [];
  let tokens = 0;

  while (attempt < 3) {
    attempt++;
    const userPrompt =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nYour previous response broke these rules. Return a corrected patch JSON only:\n${lastViolations.map((v) => `- ${v}`).join('\n')}`;

    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      opts.apiKey,
      { model: opts.model, maxTokens: TAILOR_MAX_TOKENS, schema: TAILOR_SCHEMA, log },
    );
    tokens += result.tokens;

    const raw = JSON.parse(result.text) as RawTailorPatchPlan;
    const plan = normalizePatchPlan(raw);
    const applied = applyPatchPlan(current, plan);
    if (applied.violations.length === 0) {
      const ats = scoreKeywords(plan.must_have_keywords, applied.updated);
      const atsBase = scoreKeywordsBase(plan.must_have_keywords, opts.base);
      log.debug('tailor pass ok', {
        attempt,
        tokens,
        prior_tokens: priorTokens,
        ats_score: ats.score,
        ats_missing_count: ats.missing.length,
        patches: applied.patches.length,
      });
      return {
        updated: applied.updated,
        patches: applied.patches,
        mustHaveKeywords: plan.must_have_keywords,
        ats,
        atsBase,
        tokens,
      };
    }

    log.warn('tailor response invalid; retrying', { attempt, violations: applied.violations });
    lastViolations = applied.violations;
  }

  throw new TailorValidationError(lastViolations);
}

function normalizePatchPlan(raw: RawTailorPatchPlan): TailorPatchPlan {
  return {
    must_have_keywords: dedupeStrings(raw.must_have_keywords ?? []),
    patches: (raw.patches ?? []).map((patch) => normalizePatch(patch)),
  };
}

function normalizePatch(patch: RawTailorPatch): TailorPatch {
  const reason = String(patch.reason ?? '').trim();
  if (patch.op === 'replace_summary') {
    return {
      op: 'replace_summary',
      reason,
      old_text: patch.old_text ?? '',
      new_text: patch.new_text ?? '',
    };
  }
  if (patch.op === 'set_skills') {
    return {
      op: 'set_skills',
      reason,
      old_skills: patch.old_skills ?? [],
      new_skills: patch.new_skills ?? [],
    };
  }
  if (patch.op === 'replace_project_bullet') {
    return {
      op: 'replace_project_bullet',
      reason,
      project: patch.project ?? '',
      bullet_index: numericIndex(patch.bullet_index),
      old_text: patch.old_text ?? '',
      new_text: patch.new_text ?? '',
      jd_relevance: numericRelevance(patch.jd_relevance),
    };
  }
  return {
    op: 'replace_experience_bullet',
    reason,
    company: patch.company ?? '',
    title: patch.title ?? '',
    dates: patch.dates ?? '',
    bullet_index: numericIndex(patch.bullet_index),
    old_text: patch.old_text ?? '',
    new_text: patch.new_text ?? '',
    jd_relevance: numericRelevance(patch.jd_relevance),
  };
}

function applyPatchPlan(base: BaseResume, plan: TailorPatchPlan): {
  updated: BaseResume;
  patches: TailorPatch[];
  violations: string[];
} {
  const updated = cloneResume(base);
  const applied: TailorPatch[] = [];
  const violations: string[] = [];

  for (const patch of plan.patches) {
    const before = violations.length;
    applyPatch(updated, patch, violations);
    if (violations.length === before) applied.push(patch);
  }

  validateUpdatedResume(updated, base, violations);
  return { updated, patches: applied, violations };
}

function applyPatch(resume: BaseResume, patch: TailorPatch, violations: string[]): void {
  if (!patch.reason.trim()) {
    violations.push(`${patch.op} missing reason`);
  }

  if (patch.op === 'replace_summary') {
    if (resume.summary !== patch.old_text) {
      violations.push('replace_summary old_text does not match current summary');
      return;
    }
    resume.summary = patch.new_text.trim();
    return;
  }

  if (patch.op === 'set_skills') {
    if (!sameStringList(resume.skills, patch.old_skills)) {
      violations.push('set_skills old_skills does not match current skills');
      return;
    }
    resume.skills = dedupeStrings(patch.new_skills.map((skill) => skill.trim()).filter(Boolean));
    return;
  }

  if (patch.op === 'replace_experience_bullet') {
    const job = resume.experience.find(
      (item) => item.company === patch.company && item.title === patch.title && item.dates === patch.dates,
    );
    if (!job) {
      violations.push(`replace_experience_bullet target not found: ${patch.company} / ${patch.title} / ${patch.dates}`);
      return;
    }
    replaceBullet(job.bullets, patch.bullet_index, patch.old_text, patch.new_text, patch.op, violations);
    return;
  }

  const project = resume.projects.find((item) => item.name === patch.project);
  if (!project) {
    violations.push(`replace_project_bullet target not found: ${patch.project}`);
    return;
  }
  replaceBullet(project.bullets, patch.bullet_index, patch.old_text, patch.new_text, patch.op, violations);
}

function replaceBullet(
  bullets: string[],
  index: number,
  oldText: string,
  newText: string,
  op: TailorPatch['op'],
  violations: string[],
): void {
  if (!Number.isInteger(index) || index < 0 || index >= bullets.length) {
    violations.push(`${op} bullet_index ${index} is out of range`);
    return;
  }
  if (bullets[index] !== oldText) {
    violations.push(`${op} old_text does not match bullet ${index}`);
    return;
  }
  bullets[index] = newText.trim();
}

function validateUpdatedResume(updated: BaseResume, base: BaseResume, violations: string[]): void {
  if (updated.skills.length > TAILOR_MAX_SKILLS) {
    violations.push(`skills count ${updated.skills.length} exceeds cap ${TAILOR_MAX_SKILLS}`);
  }

  for (const [index, job] of updated.experience.entries()) {
    const baseJob = base.experience[index];
    if (!baseJob || job.company !== baseJob.company || job.title !== baseJob.title || job.dates !== baseJob.dates || job.location !== baseJob.location) {
      violations.push(`locked experience fields changed at index ${index}`);
      continue;
    }
    if (job.bullets.length !== baseJob.bullets.length) {
      violations.push(`experience bullet count changed for "${job.company}"`);
    }
    for (const bullet of job.bullets) validateBulletText(bullet, `"${job.company}" bullet`, violations);
  }

  for (const [index, project] of updated.projects.entries()) {
    const baseProject = base.projects[index];
    if (!baseProject || project.name !== baseProject.name || project.link !== baseProject.link) {
      violations.push(`locked project fields changed at index ${index}`);
      continue;
    }
    if (project.bullets.length !== baseProject.bullets.length) {
      violations.push(`project bullet count changed for "${project.name}"`);
    }
    for (const bullet of project.bullets) validateBulletText(bullet, `"${project.name}" project bullet`, violations);
  }

  if (JSON.stringify(updated.contact) !== JSON.stringify(base.contact)) {
    violations.push('contact block changed');
  }
  if (JSON.stringify(updated.education) !== JSON.stringify(base.education)) {
    violations.push('education changed');
  }
  if (updated.source_pdf_name !== base.source_pdf_name || updated.parsed_at !== base.parsed_at) {
    violations.push('resume source metadata changed');
  }

  const allowedEducationClaims = educationClaims(base.education.map((edu) => `${edu.degree} ${edu.school} ${edu.details ?? ''}`).join(' '));
  const visibleClaims = [
    updated.summary,
    ...updated.skills,
    ...updated.experience.flatMap((job) => job.bullets),
    ...updated.projects.flatMap((project) => project.bullets),
  ].flatMap((text) => Array.from(educationClaims(text)));
  for (const claim of visibleClaims) {
    if (!allowedEducationClaims.has(claim)) {
      violations.push(`fabricated education credential "${claim}" appears outside base education`);
    }
  }
}

function validateBulletText(text: string, label: string, violations: string[]): void {
  if (text.length === 0) {
    violations.push(`${label} is empty`);
  }
  if (text.length > TAILOR_MAX_BULLET_CHARS) {
    violations.push(`${label} exceeds ${TAILOR_MAX_BULLET_CHARS} chars: "${text.slice(0, 40)}"`);
  }
  if (isContinuationFragment(text)) {
    violations.push(`${label} starts with a continuation fragment: "${text.slice(0, 40)}"`);
  }
}

function sameStringList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function numericIndex(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : -1;
}

function numericRelevance(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function cloneResume(resume: BaseResume): BaseResume {
  return JSON.parse(JSON.stringify(resume)) as BaseResume;
}

const EDUCATION_CREDENTIAL_PATTERNS: Array<[string, RegExp]> = [
  ['MCA', /\bMCA\b/gi],
  ['BCA', /\bBCA\b/gi],
  ['B.E.', /\bB\.?\s*E\.?\b/g],
  ['B.Tech', /\bB\.?\s*Tech\b/gi],
  ['BTECH', /\bBTECH\b/gi],
  ['M.Tech', /\bM\.?\s*Tech\b/gi],
  ['MTECH', /\bMTECH\b/gi],
  ['Bachelor of Engineering', /\bBachelor of Engineering\b/gi],
  ['Master of Engineering', /\bMaster of Engineering\b/gi],
  ['Bachelor of Technology', /\bBachelor of Technology\b/gi],
  ['Master of Technology', /\bMaster of Technology\b/gi],
];

function educationClaims(text: string): Set<string> {
  const claims = new Set<string>();
  for (const [claim, pattern] of EDUCATION_CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) claims.add(claim);
  }
  return claims;
}

function isContinuationFragment(text: string): boolean {
  return /^\s*(?:…|\.{3}|and\s|or\s|but\s)/i.test(text);
}

function roundCost(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
