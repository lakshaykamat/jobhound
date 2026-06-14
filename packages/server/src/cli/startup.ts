import { AppConfig, tryLoadConfig } from '../config';
import { logger } from '../logger';

export interface StartupCheck {
  configPath: string;
  dataDir: string;
}

export interface StartupResult {
  config: AppConfig | null;
}

export function validateStartup(opts: StartupCheck): StartupResult {
  const config = tryLoadConfig(opts.configPath);

  if (!config) {
    logger.warn(
      'no valid config.json found; server will boot but cycles cannot run until config is saved via the Setup page',
      { config_path: opts.configPath, data_dir: opts.dataDir },
    );
    return { config: null };
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
