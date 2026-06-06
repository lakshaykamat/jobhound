import { JobRecord, RawPosting, WorkMode } from '../types';
import { chat } from '../adapters/llm';
import { OpenAiConfig } from '../config';
import { ANALYZE_MAX_TOKENS, VALID_WORK_MODES } from '../constants';
import { Logger, logger as rootLogger } from '../logger';
import { ANALYZE_SCHEMA, ANALYZE_SYSTEM_PROMPT, buildAnalyzePrompt } from '../prompts';
import { parsePostedAt } from './posted-at';

export interface AnalyzeResult {
  record: JobRecord;
  tokens: number;
}

export async function analyzePosting(
  jobId: string,
  posting: RawPosting,
  apiKey: string,
  openai: OpenAiConfig,
  log: Logger = rootLogger,
): Promise<AnalyzeResult> {
  const now = new Date().toISOString();
  const salary = parseSalary(posting.salary);

  let workMode = detectWorkMode(posting);
  let seniority = detectSeniority(posting.title);
  let tokens = 0;

  log.debug('analyze heuristics', { work_mode: workMode, seniority });

  if (workMode === 'unknown' || seniority === null) {
    log.debug('analyze invoking LLM fallback', {
      missing_work_mode: workMode === 'unknown',
      missing_seniority: seniority === null,
    });
    const inferred = await safeInfer(jobId, posting, apiKey, openai, log);
    tokens += inferred.tokens;
    if (workMode === 'unknown' && inferred.work_mode && isWorkMode(inferred.work_mode)) {
      workMode = inferred.work_mode;
    }
    if (seniority === null && inferred.seniority) {
      seniority = inferred.seniority;
    }
  }

  const record: JobRecord = {
    job_id: jobId,
    title: posting.title,
    company: posting.company,
    location: posting.location,
    work_mode: workMode,
    salary_min: salary.min,
    salary_max: salary.max,
    seniority,
    source: posting.via,
    apply_url: posting.apply_link,
    posted_date: parsePostedAt(posting.posted_at),
    score: 0,
    rationale: '',
    breakdown: null,
    status: 'new',
    first_seen: now,
    last_seen: now,
  };

  return { record, tokens };
}

async function safeInfer(
  jobId: string,
  posting: RawPosting,
  apiKey: string,
  openai: OpenAiConfig,
  log: Logger,
) {
  try {
    const result = await chat(
      [
        { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
        { role: 'user', content: buildAnalyzePrompt(posting) },
      ],
      apiKey,
      {
        schema: ANALYZE_SCHEMA,
        maxTokens: ANALYZE_MAX_TOKENS,
        model: openai.model,
        log,
      },
    );
    const parsed = parseInferred(result.text);
    return { ...parsed, tokens: result.tokens };
  } catch (err) {
    log.warn('LLM inference failed in analyze; falling back to nulls', { job_id: jobId, err });
    return { work_mode: null, seniority: null, tokens: 0 };
  }
}

function parseInferred(text: string): { work_mode: string | null; seniority: string | null } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { work_mode: null, seniority: null };
  try {
    const obj = JSON.parse(match[0]) as { work_mode?: string; seniority?: string };
    return {
      work_mode: cleanString(obj.work_mode),
      seniority: cleanString(obj.seniority),
    };
  } catch {
    return { work_mode: null, seniority: null };
  }
}

function cleanString(s?: string): string | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  return v === '' || v === 'null' || v === 'unknown' ? null : v;
}

function detectWorkMode(posting: RawPosting): WorkMode {
  const text = `${posting.title} ${posting.location} ${posting.description}`.toLowerCase();
  if (/\b(remote|work from home|wfh|fully remote)\b/.test(text)) return 'remote';
  if (/\bhybrid\b/.test(text)) return 'hybrid';
  if (/\b(on-?site|in office|in-office)\b/.test(text)) return 'onsite';
  return 'unknown';
}

function detectSeniority(title: string): string | null {
  const t = title.toLowerCase();
  if (/\b(intern|internship)\b/.test(t)) return 'intern';
  if (/\b(staff|principal)\b/.test(t)) return 'principal';
  if (/\b(lead|tech lead|engineering lead)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry|graduate)\b/.test(t)) return 'junior';
  return null;
}

function parseSalary(raw: string | null): { min: number | null; max: number | null } {
  if (!raw) return { min: null, max: null };
  const s = raw.replace(/[,₹$]/g, '').toLowerCase();

  const lpaRange = s.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/);
  if (lpaRange) return { min: Number(lpaRange[1]) * 100_000, max: Number(lpaRange[2]) * 100_000 };

  const lpa = s.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/);
  if (lpa) return { min: Number(lpa[1]) * 100_000, max: Number(lpa[1]) * 100_000 };

  const kRange = s.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*k\b/);
  if (kRange) return { min: Number(kRange[1]) * 1_000, max: Number(kRange[2]) * 1_000 };

  const k = s.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (k) return { min: Number(k[1]) * 1_000, max: Number(k[1]) * 1_000 };

  return { min: null, max: null };
}

function isWorkMode(s: string): s is WorkMode {
  return (VALID_WORK_MODES as string[]).includes(s);
}
