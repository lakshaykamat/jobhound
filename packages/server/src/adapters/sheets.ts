import {
  APPS_SCRIPT_BACKOFF_BASE_MS,
  APPS_SCRIPT_BACKOFF_MAX_MS,
  APPS_SCRIPT_MAX_ATTEMPTS,
  SHEET_UPSERT_CHUNK_SIZE,
} from '../constants';
import { logger } from '../logger';
import { JobRecord, SelfTestStep } from '../types';
import { retry } from './retry';

class AppsScriptHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

class AppsScriptHtmlError extends Error {}

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
    logger.debug('apps-script request', { action: envelope.action, records: envelope.records?.length });
    const payload = JSON.stringify({ token: this.token, ...envelope });

    return retry(() => this.callOnce<T>(envelope, payload), {
      label: `apps-script ${envelope.action}`,
      maxAttempts: APPS_SCRIPT_MAX_ATTEMPTS,
      backoffBaseMs: APPS_SCRIPT_BACKOFF_BASE_MS,
      backoffMaxMs: APPS_SCRIPT_BACKOFF_MAX_MS,
      shouldRetry: (err) => {
        if (err instanceof AppsScriptHtmlError) return true;
        if (err instanceof AppsScriptHttpError) return err.status === 429 || err.status >= 500;
        if (err instanceof SyntaxError) return true;
        return err instanceof TypeError;
      },
      log: logger,
    });
  }

  private async callOnce<T>(envelope: Envelope, payload: string): Promise<T> {
    const res = await fetch(this.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.text();

    if (!res.ok) {
      throw new AppsScriptHttpError(res.status, `Apps Script HTTP ${res.status}: ${summarize(body)}`);
    }
    if (looksLikeHtml(body)) {
      throw new AppsScriptHtmlError(
        'Apps Script returned an HTML page instead of JSON. ' +
          'Likely cause: the Web App is deployed with restricted access. ' +
          'Re-deploy with "Who has access: Anyone" and use the /exec URL.',
      );
    }
    const data = JSON.parse(body) as T & { error?: string };
    if (data.error) throw new Error(`Apps Script error: ${data.error}`);
    return data;
  }
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
