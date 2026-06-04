import { existsSync } from 'fs';
import { loadConfig, AppConfig } from '../config';
import { logger } from '../logger';

const REQUIRED_ENV = ['APPS_SCRIPT_URL', 'APPS_SCRIPT_TOKEN', 'SERPAPI_KEY', 'OPENAI_KEY'];

export interface StartupCheck {
  configPath: string;
  dataDir: string;
}

export interface StartupResult {
  config: AppConfig;
  env: Record<string, string>;
}

export class StartupValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`startup validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
    this.name = 'StartupValidationError';
    this.errors = errors;
  }
}

export function validateStartup(opts: StartupCheck): StartupResult {
  const errors: string[] = [];

  if (!existsSync(opts.configPath)) {
    errors.push(`config file not found at "${opts.configPath}"`);
  }

  const env: Record<string, string> = {};
  for (const k of REQUIRED_ENV) {
    const v = process.env[k];
    if (!v) errors.push(`env var ${k} is required`);
    else env[k] = v;
  }

  if (env.APPS_SCRIPT_URL && !/^https:\/\/script\.google\.com\//.test(env.APPS_SCRIPT_URL)) {
    errors.push('APPS_SCRIPT_URL must be a https://script.google.com/... /exec URL');
  }

  let config: AppConfig | null = null;
  if (existsSync(opts.configPath)) {
    try {
      config = loadConfig(opts.configPath);
    } catch (err) {
      errors.push(`config: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) logger.error('startup validation issue', { issue: e });
    throw new StartupValidationError(errors);
  }

  logger.info('startup validation passed', {
    config_path: opts.configPath,
    data_dir: opts.dataDir,
    queries: config!.cycle.queries.length,
    model: config!.openai.model,
    llm_concurrency: config!.openai.llm_concurrency,
    poll_interval_seconds: config!.daemon.poll_interval_seconds,
    monthly_search_cap: config!.daemon.monthly_search_cap,
    score_threshold: config!.cycle.score_threshold,
    dedup_strategy: config!.cycle.dedup_strategy,
    platforms: config!.serpapi.platforms.length,
    region: `${config!.serpapi.country}/${config!.serpapi.language}`,
  });

  return { config: config!, env };
}
