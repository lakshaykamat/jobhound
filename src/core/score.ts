import { ExtractionConfig, OpenAiConfig, ScoringConfig } from '../config';
import { chat } from '../adapters/llm';
import { Logger, logger as rootLogger } from '../logger';
import { FitProfile, JobRecord, ScoreAxis, ScoreBreakdown } from '../types';
import { SCORE_SCHEMA, SCORE_SYSTEM_PROMPT, buildScorePrompt } from '../prompts';

export interface ScoreResult {
  score: number;
  rationale: string;
  breakdown: ScoreBreakdown;
  tokens: number;
}

const LLM_AXES: Exclude<ScoreAxis, 'recency'>[] = [
  'skills_match',
  'seniority_match',
  'location_match',
  'comp_match',
  'domain_match',
];

const CONFIDENCE_VALUES = new Set(['low', 'medium', 'high']);

export async function scoreJob(
  record: JobRecord,
  description: string,
  profile: FitProfile,
  apiKey: string,
  openai: OpenAiConfig,
  extraction: ExtractionConfig,
  scoring: ScoringConfig,
  log: Logger = rootLogger,
): Promise<ScoreResult> {
  const result = await chat(
    [
      { role: 'system', content: SCORE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildScorePrompt(record, description, profile, extraction.description_max_chars),
      },
    ],
    apiKey,
    {
      schema: SCORE_SCHEMA,
      maxTokens: extraction.score_max_tokens,
      model: openai.model,
      log,
    },
  );
  const breakdown = assembleBreakdown(result.text, record.posted_date, scoring);
  return {
    score: breakdown.final_score,
    rationale: breakdown.rationale,
    breakdown,
    tokens: result.tokens,
  };
}

function assembleBreakdown(
  text: string,
  postedDate: string | null,
  scoring: ScoringConfig,
): ScoreBreakdown {
  const obj = parseJson(text);

  const axesRaw = obj.axes as Record<string, { score?: unknown; note?: unknown }> | undefined;
  if (!axesRaw) throw new Error('scorer JSON missing "axes"');

  const axes = {} as ScoreBreakdown['axes'];
  for (const axis of LLM_AXES) {
    const raw = axesRaw[axis];
    if (!raw) throw new Error(`scorer JSON missing axis "${axis}"`);
    const score = Math.round(Number(raw.score));
    if (!Number.isFinite(score)) throw new Error(`scorer axis "${axis}" has non-numeric score`);
    axes[axis] = {
      score: clamp(score, 0, 100),
      note: typeof raw.note === 'string' ? raw.note.trim() : '',
    };
  }
  axes.recency = computeRecency(postedDate, scoring);

  const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : '';
  if (!rationale) throw new Error('scorer JSON missing rationale');

  const confidenceRaw = typeof obj.confidence === 'string' ? obj.confidence.toLowerCase() : '';
  const confidence = (CONFIDENCE_VALUES.has(confidenceRaw) ? confidenceRaw : 'medium') as
    ScoreBreakdown['confidence'];

  const dealBreakers = Array.isArray(obj.deal_breakers)
    ? (obj.deal_breakers as unknown[])
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        .map((d) => d.trim())
    : [];

  let finalScore = weightedFinal(axes, scoring);
  if (dealBreakers.length > 0) finalScore = Math.min(finalScore, scoring.dealbreaker_score_cap);

  return { axes, final_score: finalScore, confidence, deal_breakers: dealBreakers, rationale };
}

function computeRecency(
  postedDate: string | null,
  scoring: ScoringConfig,
): { score: number; note: string } {
  if (!postedDate) return { score: 0, note: 'unknown posted date' };
  const posted = Date.parse(postedDate);
  if (!Number.isFinite(posted)) return { score: 0, note: 'unparseable posted date' };
  const ageDays = Math.max(0, Math.floor((Date.now() - posted) / 86_400_000));
  if (ageDays <= scoring.recency_full_days) return { score: 100, note: `${ageDays}d old` };
  if (ageDays >= scoring.recency_decay_days) return { score: 0, note: `${ageDays}d old` };
  const span = scoring.recency_decay_days - scoring.recency_full_days;
  const score = Math.round(100 * (1 - (ageDays - scoring.recency_full_days) / span));
  return { score: clamp(score, 0, 100), note: `${ageDays}d old` };
}

function weightedFinal(axes: ScoreBreakdown['axes'], scoring: ScoringConfig): number {
  let sum = 0;
  let totalWeight = 0;
  for (const axis of Object.keys(scoring.axis_weights) as ScoreAxis[]) {
    const w = scoring.axis_weights[axis];
    sum += axes[axis].score * w;
    totalWeight += w;
  }
  return clamp(Math.round(sum / totalWeight), 0, 100);
}

function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('scorer returned no JSON');
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`scorer returned invalid JSON: ${(err as Error).message}`);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
