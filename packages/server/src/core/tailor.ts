import { chat } from '../adapters/llm';
import { Logger, logger as rootLogger } from '../logger';
import { costUsd } from '../pricing';
import {
  TAILOR_ATS_MAX_RETRIES,
  TAILOR_ATS_TARGET,
  TAILOR_MAX_BULLETS_PER_JOB,
  TAILOR_MAX_BULLETS_PER_PROJECT,
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
  buildTailorRefinePrompt,
} from '../prompts';
import { BaseResume, KeywordScore, TailoredResume, TailorResult } from '../types';
import { fitToOnePage } from './one-page-fit';
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
  draft?: TailoredResume;
  log?: Logger;
}

export async function tailorResume(opts: TailorOptions): Promise<TailorResult> {
  const log = opts.log ?? rootLogger;
  const userSuppliedDraft = !!opts.draft;
  const initialSystemPrompt = userSuppliedDraft ? TAILOR_REFINE_SYSTEM_PROMPT : TAILOR_SYSTEM_PROMPT;
  const initialUserPrompt = userSuppliedDraft
    ? buildTailorRefinePrompt(opts.base, opts.draft!, opts.jd)
    : buildTailorPrompt(opts.base, opts.jd);

  log.debug('tailor start', {
    mode: userSuppliedDraft ? 'refine' : 'fresh',
    model: opts.model ?? '(default)',
    jd_chars: opts.jd.length,
    base_skills: opts.base.skills.length,
    base_experience: opts.base.experience.length,
    base_projects: opts.base.projects.length,
  });

  let pass = await runTailorPass(opts, initialSystemPrompt, initialUserPrompt, 0, log);
  let totalTokens = pass.tokens;

  // Skip ATS retries when the user supplied their own draft — they're driving.
  if (!userSuppliedDraft) {
    for (let retry = 1; retry <= TAILOR_ATS_MAX_RETRIES && pass.ats.score < TAILOR_ATS_TARGET; retry++) {
      const retryPrompt = buildTailorAtsRetryPrompt(
        opts.base,
        pass.tailored,
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
      const refined = await runTailorPass(opts, TAILOR_REFINE_SYSTEM_PROMPT, retryPrompt, totalTokens, log);
      totalTokens += refined.tokens;

      // Stop if the refinement didn't actually help — the candidate's base
      // resume simply doesn't support the remaining keywords.
      if (refined.ats.score <= pass.ats.score) {
        log.info('tailor ats retry plateaued; accepting previous draft', {
          retry,
          prev_score: pass.ats.score,
          refined_score: refined.ats.score,
        });
        break;
      }
      pass = refined;
    }
  }

  log.info('tailor accepted', {
    mode: userSuppliedDraft ? 'refine' : 'fresh',
    tokens: totalTokens,
    dropped: pass.droppedBullets.length,
    truncated: pass.truncated,
    ats_score_base: pass.atsBase.score,
    ats_score_tailored: pass.ats.score,
    ats_target: TAILOR_ATS_TARGET,
    ats_missing: pass.ats.missing.length,
  });

  return {
    base: opts.base,
    tailored: pass.tailored,
    dropped_bullets: pass.droppedBullets,
    ats: pass.ats,
    ats_base: pass.atsBase,
    tokens: totalTokens,
    cost_usd: roundCost(costUsd(opts.model ?? 'gpt-5.2', totalTokens)),
    truncation_warning: pass.truncated,
  };
}

interface TailorPass {
  tailored: TailoredResume;
  droppedBullets: TailorResult['dropped_bullets'];
  ats: KeywordScore;
  atsBase: KeywordScore;
  truncated: boolean;
  tokens: number;
}

async function runTailorPass(
  opts: TailorOptions,
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
        : `${basePrompt}\n\nYour previous response broke these rules — fix them now:\n${lastViolations.map((v) => `- ${v}`).join('\n')}`;

    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      opts.apiKey,
      { model: opts.model, maxTokens: TAILOR_MAX_TOKENS, schema: TAILOR_SCHEMA, log },
    );
    tokens += result.tokens;

    const raw = JSON.parse(result.text) as TailoredResume;
    const { tailored, truncatedBullets } = salvageTailored(raw);
    if (truncatedBullets > 0) {
      log.info('tailor truncated over-long bullets', { attempt, truncated_bullets: truncatedBullets });
    }
    const violations = validateTailored(tailored, opts.base);
    if (violations.length === 0) {
      const fit = fitToOnePage(tailored);
      const ats = scoreKeywords(fit.trimmed.must_have_keywords, fit.trimmed);
      const atsBase = scoreKeywordsBase(fit.trimmed.must_have_keywords, opts.base);
      log.debug('tailor pass ok', {
        attempt,
        tokens,
        prior_tokens: priorTokens,
        ats_score: ats.score,
        ats_missing_count: ats.missing.length,
      });
      return {
        tailored: fit.trimmed,
        droppedBullets: fit.dropped,
        ats,
        atsBase,
        truncated: fit.truncated,
        tokens,
      };
    }
    log.warn('tailor response invalid; retrying', { attempt, violations });
    lastViolations = violations;
  }

  throw new TailorValidationError(lastViolations);
}

function validateTailored(tailored: TailoredResume, base: BaseResume): string[] {
  const violations: string[] = [];
  if (tailored.skills.length > TAILOR_MAX_SKILLS) {
    violations.push(`skills count ${tailored.skills.length} exceeds cap ${TAILOR_MAX_SKILLS}`);
  }

  const baseCompanies = new Set(base.experience.map((j) => j.company.toLowerCase()));
  for (const job of tailored.experience) {
    if (!baseCompanies.has(job.company.toLowerCase())) {
      violations.push(`fabricated experience at "${job.company}" (not in base resume)`);
    }
    if (job.bullets.length > TAILOR_MAX_BULLETS_PER_JOB) {
      violations.push(`"${job.company}" has ${job.bullets.length} bullets (cap ${TAILOR_MAX_BULLETS_PER_JOB})`);
    }
    for (const bullet of job.bullets) {
      if (bullet.text.length > TAILOR_MAX_BULLET_CHARS) {
        violations.push(`bullet exceeds ${TAILOR_MAX_BULLET_CHARS} chars: "${bullet.text.slice(0, 40)}…"`);
      }
      if (isContinuationFragment(bullet.text)) {
        violations.push(`"${job.company}" bullet starts with a continuation fragment ("…and", "...", "and "): "${bullet.text.slice(0, 40)}"`);
      }
    }
  }

  const baseProjects = new Set(base.projects.map((p) => p.name.toLowerCase()));
  for (const proj of tailored.projects) {
    if (!baseProjects.has(proj.name.toLowerCase())) {
      violations.push(`fabricated project "${proj.name}" (not in base resume)`);
    }
    if (proj.bullets.length > TAILOR_MAX_BULLETS_PER_PROJECT) {
      violations.push(`"${proj.name}" has ${proj.bullets.length} bullets (cap ${TAILOR_MAX_BULLETS_PER_PROJECT})`);
    }
    for (const bullet of proj.bullets) {
      if (bullet.text.length > TAILOR_MAX_BULLET_CHARS) {
        violations.push(`project bullet exceeds ${TAILOR_MAX_BULLET_CHARS} chars: "${bullet.text.slice(0, 40)}…"`);
      }
      if (isContinuationFragment(bullet.text)) {
        violations.push(`"${proj.name}" bullet starts with a continuation fragment: "${bullet.text.slice(0, 40)}"`);
      }
    }
  }

  return violations;
}

function isContinuationFragment(text: string): boolean {
  return /^\s*(?:…|\.{3}|and\s|or\s|but\s)/i.test(text);
}

interface SalvageResult {
  tailored: TailoredResume;
  truncatedBullets: number;
}

function salvageTailored(tailored: TailoredResume): SalvageResult {
  let truncatedBullets = 0;
  const fixBullet = <T extends { text: string }>(b: T): T => {
    if (b.text.length <= TAILOR_MAX_BULLET_CHARS) return b;
    truncatedBullets++;
    const slice = b.text.slice(0, TAILOR_MAX_BULLET_CHARS);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
    return { ...b, text: cut.replace(/[\s,;:\-–—]+$/, '') };
  };
  const salvaged: TailoredResume = {
    ...tailored,
    experience: tailored.experience.map((j) => ({ ...j, bullets: j.bullets.map(fixBullet) })),
    projects: tailored.projects.map((p) => ({ ...p, bullets: p.bullets.map(fixBullet) })),
  };
  return { tailored: salvaged, truncatedBullets };
}

function roundCost(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
