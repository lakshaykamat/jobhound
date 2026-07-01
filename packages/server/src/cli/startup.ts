import { existsSync } from 'fs';
import { AppConfig, loadConfig } from '../config';
import { logger } from '../logger';

export interface StartupCheck {
  configPath: string;
  dataDir: string;
}

export interface StartupResult {
  config: AppConfig;
}

export function validateStartup(opts: StartupCheck): StartupResult {
  if (!existsSync(opts.configPath)) {
    logger.error('config.json not found — create it before starting the server', {
      config_path: opts.configPath,
      data_dir: opts.dataDir,
    });
    process.exit(1);
  }

  let config: AppConfig;
  try {
    config = loadConfig(opts.configPath);
  } catch (err) {
    logger.error('config.json is invalid', { config_path: opts.configPath, err });
    process.exit(1);
  }

  logger.info('startup validation passed', {
    config_path: opts.configPath,
    data_dir: opts.dataDir,
    queries: config.cycle.queries.length,
    model: config.openai.model,
    llm_concurrency: config.openai.llm_concurrency,
    poll_interval_seconds: config.server.poll_interval_seconds,
    http_port: config.server.http_port,
    score_threshold: config.cycle.score_threshold,
    dedup_strategy: config.cycle.dedup_strategy,
    platforms: config.serpapi.platforms.length,
    region: `${config.serpapi.country}/${config.serpapi.language}`,
  });

  return { config };
}
