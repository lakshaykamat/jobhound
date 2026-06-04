import {
  APPS_SCRIPT_BACKOFF_BASE_MS,
  APPS_SCRIPT_BACKOFF_MAX_MS,
  APPS_SCRIPT_MAX_ATTEMPTS,
  SHEET_UPSERT_CHUNK_SIZE,
} from '../constants';
import { logger } from '../logger';
import { JobRecord, SelfTestStep } from '../types';

type Action =
  | 'ensureHeader'
  | 'readAll'
  | 'upsert'
  | 'bulkImport'
  | 'selfTest';

interface Envelope {
  action: Action;
  records?: JobRecord[];
}

export class JobsSheet {
  constructor(private webAppUrl: string, private token: string) {}

  async ensureHeader(): Promise<void> {
    await this.call({ action: 'ensureHeader' });
  }

  async readAll(): Promise<JobRecord[]> {
    const res = await this.call<{ records: JobRecord[] }>({ action: 'readAll' });
    return res.records ?? [];
  }

  async upsertBatch(records: JobRecord[]): Promise<{ inserted: number; updated: number }> {
    if (records.length === 0) return { inserted: 0, updated: 0 };
    let inserted = 0;
    let updated = 0;
    const total = records.length;
    let chunkIdx = 0;
    for (const chunk of chunked(records, SHEET_UPSERT_CHUNK_SIZE)) {
      chunkIdx++;
      logger.debug('sheet upsert chunk', { chunk: chunkIdx, size: chunk.length, total });
      const res = await this.call<{ inserted: number; updated: number }>({
        action: 'upsert',
        records: chunk,
      });
      inserted += res.inserted;
      updated += res.updated;
    }
    return { inserted, updated };
  }

  async bulkImport(records: JobRecord[]): Promise<{ inserted: number }> {
    if (records.length === 0) return { inserted: 0 };
    let inserted = 0;
    let chunkIdx = 0;
    for (const chunk of chunked(records, SHEET_UPSERT_CHUNK_SIZE)) {
      chunkIdx++;
      logger.debug('sheet bulkImport chunk', { chunk: chunkIdx, size: chunk.length });
      const res = await this.call<{ inserted: number }>({ action: 'bulkImport', records: chunk });
      inserted += res.inserted;
    }
    return { inserted };
  }

  async selfTest(): Promise<{ results: SelfTestStep[] }> {
    return this.call({ action: 'selfTest' });
  }

  private async call<T>(envelope: Envelope): Promise<T> {
    const recordCount = envelope.records?.length;
    logger.debug('apps-script request', { action: envelope.action, records: recordCount });
    const payload = JSON.stringify({ token: this.token, ...envelope });

    for (let attempt = 1; attempt <= APPS_SCRIPT_MAX_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(this.webAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          redirect: 'follow',
        });
        const body = await res.text();
        const duration_ms = Date.now() - started;

        if (!res.ok) {
          const retriable = res.status === 429 || res.status >= 500 || looksLikeHtml(body);
          if (retriable && attempt < APPS_SCRIPT_MAX_ATTEMPTS) {
            await backoff('http', res.status, attempt, envelope.action, body);
            continue;
          }
          logger.error('apps-script HTTP error', {
            action: envelope.action,
            status: res.status,
            attempt,
            duration_ms,
            body_preview: body.slice(0, 200),
          });
          throw new Error(`Apps Script HTTP ${res.status}: ${summarize(body)}`);
        }

        if (looksLikeHtml(body)) {
          if (attempt < APPS_SCRIPT_MAX_ATTEMPTS) {
            await backoff('html', res.status, attempt, envelope.action, body);
            continue;
          }
          logger.error('apps-script returned HTML after retries', { action: envelope.action });
          throw new Error(
            'Apps Script returned an HTML page instead of JSON. ' +
              'Likely cause: the Web App is deployed with restricted access. ' +
              'Re-deploy with "Who has access: Anyone" and use the /exec URL.',
          );
        }

        const data = JSON.parse(body) as T & { error?: string };
        if (data.error) {
          logger.error('apps-script reported error', {
            action: envelope.action,
            duration_ms,
            apps_script_error: data.error,
          });
          throw new Error(`Apps Script error: ${data.error}`);
        }
        logger.debug('apps-script response ok', {
          action: envelope.action,
          attempt,
          duration_ms,
        });
        return data;
      } catch (err) {
        if (err instanceof TypeError && attempt < APPS_SCRIPT_MAX_ATTEMPTS) {
          await backoff('network', 0, attempt, envelope.action, (err as Error).message);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Apps Script call exhausted retries unexpectedly');
  }
}

async function backoff(
  reason: 'http' | 'html' | 'network',
  status: number,
  attempt: number,
  action: string,
  detail: string,
): Promise<void> {
  const delay_ms = Math.min(
    APPS_SCRIPT_BACKOFF_BASE_MS * 2 ** (attempt - 1),
    APPS_SCRIPT_BACKOFF_MAX_MS,
  );
  logger.warn('apps-script request failed; retrying', {
    action,
    reason,
    status,
    attempt,
    max_attempts: APPS_SCRIPT_MAX_ATTEMPTS,
    delay_ms,
    detail_preview: detail.slice(0, 120),
  });
  await new Promise((r) => setTimeout(r, delay_ms));
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 200).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

function summarize(body: string): string {
  const trimmed = body.trim();
  if (looksLikeHtml(trimmed)) {
    return 'Google access-denied page (deploy Web App with "Anyone" access)';
  }
  return trimmed.length > 200 ? trimmed.slice(0, 200) + '… (truncated)' : trimmed;
}
