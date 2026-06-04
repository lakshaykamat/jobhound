import 'dotenv/config';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import {
  DEFAULT_ANALYZE_MAX_TOKENS,
  DEFAULT_CHAT_MAX_TOKENS,
  DEFAULT_DEALBREAKER_SCORE_CAP,
  DEFAULT_DEDUP_STRATEGY,
  DEFAULT_DESCRIPTION_MAX_CHARS,
  DEFAULT_LLM_CONCURRENCY,
  DEFAULT_MAX_JOB_AGE_DAYS,
  DEFAULT_MAX_JOBS_PER_HOUR,
  DEFAULT_MAX_PAGES_PER_QUERY,
  DEFAULT_MONTHLY_SEARCH_CAP,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_PROFILE_EXTRACTION_MAX_TOKENS,
  DEFAULT_RECENCY_DECAY_DAYS,
  DEFAULT_RECENCY_FULL_DAYS,
  DEFAULT_RESUME_MAX_CHARS,
  DEFAULT_SCORE_AXIS_WEIGHTS,
  DEFAULT_SCORE_MAX_TOKENS,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_SEARCH_WARN_THRESHOLD,
  DEFAULT_SERPAPI_COUNTRY,
  DEFAULT_SERPAPI_LANGUAGE,
  DEFAULT_SERPAPI_PLATFORMS,
  DEFAULT_STALENESS_DAYS,
} from '../constants';
import { FitProfile } from '../types';
import { readResume } from '../adapters/resume';
import { extractProfile, profileHasContent } from '../core/profile';
import { deriveQueries } from '../core/queries';

const CONFIG_PATH = './config.json';
const DEFAULT_RESUME_DIR = './data';
const REQUIRED_ENV = ['APPS_SCRIPT_URL', 'APPS_SCRIPT_TOKEN', 'SERPAPI_KEY', 'OPENAI_KEY'];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const resumeArg = args.find((a) => !a.startsWith('--'));

  ensureEnv();
  ensureConfigWritable(force);

  const resumePath = resumeArg ?? autoDetectResume();
  console.log(`reading resume: ${resumePath}`);
  const text = await readResume(resumePath, DEFAULT_RESUME_MAX_CHARS);
  console.log(`parsed ${text.length} chars; calling LLM…`);

  const profile = await extractProfile(
    text,
    process.env.OPENAI_KEY!,
    { model: DEFAULT_OPENAI_MODEL, llm_concurrency: DEFAULT_LLM_CONCURRENCY },
    {
      resume_max_chars: DEFAULT_RESUME_MAX_CHARS,
      description_max_chars: DEFAULT_DESCRIPTION_MAX_CHARS,
      chat_max_tokens: DEFAULT_CHAT_MAX_TOKENS,
      analyze_max_tokens: DEFAULT_ANALYZE_MAX_TOKENS,
      score_max_tokens: DEFAULT_SCORE_MAX_TOKENS,
      profile_extraction_max_tokens: DEFAULT_PROFILE_EXTRACTION_MAX_TOKENS,
    },
  );
  const queries = deriveQueries(profile);
  const config = buildConfig(profile, queries);

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');

  console.log('\nwrote config.json:');
  console.log(JSON.stringify(config, null, 2));
  console.log(`\nnext: docker compose up -d  (or 'docker compose run --rm job-finder node dist/cli/daemon.js --once' to smoke-test)`);
}

function ensureEnv(): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  console.error(
    `missing required env var(s): ${missing.join(', ')}\n` +
      `fill .env (copy from .env.example) before running bootstrap.`,
  );
  process.exit(1);
}

function ensureConfigWritable(force: boolean): void {
  if (!existsSync(CONFIG_PATH)) return;
  if (force) return;
  try {
    const existing = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as { profile?: FitProfile };
    if (existing.profile && profileHasContent(existing.profile)) {
      console.error(
        `${CONFIG_PATH} already exists with a populated profile. Re-run with --force to overwrite.`,
      );
      process.exit(1);
    }
  } catch {
    console.error(
      `${CONFIG_PATH} exists but could not be parsed. Re-run with --force to overwrite.`,
    );
    process.exit(1);
  }
}

function autoDetectResume(): string {
  if (!existsSync(DEFAULT_RESUME_DIR)) {
    fail(`resume not found: ${DEFAULT_RESUME_DIR}/ does not exist. Create it and drop your resume.pdf or resume.txt inside.`);
  }
  for (const preferred of ['resume.pdf', 'resume.txt']) {
    const p = path.join(DEFAULT_RESUME_DIR, preferred);
    if (existsSync(p)) return p;
  }
  const candidates = readdirSync(DEFAULT_RESUME_DIR)
    .filter((f) => /\.(pdf|txt)$/i.test(f))
    .filter((f) => statSync(path.join(DEFAULT_RESUME_DIR, f)).isFile());
  if (candidates.length === 1) return path.join(DEFAULT_RESUME_DIR, candidates[0]);
  if (candidates.length === 0) {
    fail(`no resume found in ${DEFAULT_RESUME_DIR}/. Add resume.pdf or resume.txt, or pass a path: bootstrap <path>`);
  }
  fail(`multiple resumes in ${DEFAULT_RESUME_DIR}/ (${candidates.join(', ')}). Pass an explicit path.`);
}

function buildConfig(profile: FitProfile, queries: string[]): Record<string, unknown> {
  return {
    cycle: {
      queries,
      score_threshold: DEFAULT_SCORE_THRESHOLD,
      max_pages_per_query: DEFAULT_MAX_PAGES_PER_QUERY,
      staleness_days: DEFAULT_STALENESS_DAYS,
      dedup_strategy: DEFAULT_DEDUP_STRATEGY,
      max_jobs_per_hour: DEFAULT_MAX_JOBS_PER_HOUR,
      max_job_age_days: DEFAULT_MAX_JOB_AGE_DAYS,
    },
    daemon: {
      poll_interval_seconds: DEFAULT_POLL_INTERVAL_SECONDS,
      monthly_search_cap: DEFAULT_MONTHLY_SEARCH_CAP,
      search_warn_threshold: DEFAULT_SEARCH_WARN_THRESHOLD,
    },
    serpapi: {
      country: DEFAULT_SERPAPI_COUNTRY,
      language: DEFAULT_SERPAPI_LANGUAGE,
      platforms: [...DEFAULT_SERPAPI_PLATFORMS],
    },
    openai: {
      model: DEFAULT_OPENAI_MODEL,
      llm_concurrency: DEFAULT_LLM_CONCURRENCY,
    },
    extraction: {
      resume_max_chars: DEFAULT_RESUME_MAX_CHARS,
      description_max_chars: DEFAULT_DESCRIPTION_MAX_CHARS,
      chat_max_tokens: DEFAULT_CHAT_MAX_TOKENS,
      analyze_max_tokens: DEFAULT_ANALYZE_MAX_TOKENS,
      score_max_tokens: DEFAULT_SCORE_MAX_TOKENS,
      profile_extraction_max_tokens: DEFAULT_PROFILE_EXTRACTION_MAX_TOKENS,
    },
    scoring: {
      axis_weights: DEFAULT_SCORE_AXIS_WEIGHTS,
      dealbreaker_score_cap: DEFAULT_DEALBREAKER_SCORE_CAP,
      recency_full_days: DEFAULT_RECENCY_FULL_DAYS,
      recency_decay_days: DEFAULT_RECENCY_DECAY_DAYS,
    },
    profile,
  };
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
