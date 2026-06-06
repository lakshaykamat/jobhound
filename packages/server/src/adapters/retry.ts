import { Logger } from '../logger';

export interface RetryOptions {
  label: string;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  shouldRetry: (err: unknown) => boolean;
  log: Logger;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= opts.maxAttempts || !opts.shouldRetry(err)) throw err;
      const delayMs = Math.min(opts.backoffBaseMs * 2 ** (attempt - 1), opts.backoffMaxMs);
      opts.log.warn(`${opts.label} failed; retrying`, {
        attempt,
        max_attempts: opts.maxAttempts,
        delay_ms: delayMs,
        err_message: err instanceof Error ? err.message : String(err),
      });
      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
