import {
  DEFAULT_CHAT_MAX_TOKENS,
  DEFAULT_OPENAI_MODEL,
  OPENAI_API_URL,
  OPENAI_BACKOFF_BASE_MS,
  OPENAI_BACKOFF_MAX_MS,
  OPENAI_MAX_ATTEMPTS,
} from '../constants';
import { Logger, logger as rootLogger } from '../logger';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  schema?: JsonSchemaSpec;
  log?: Logger;
}

export interface ChatResult {
  text: string;
  tokens: number;
}

export async function chat(
  messages: ChatMessage[],
  apiKey: string,
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const log = opts.log ?? rootLogger;
  const model = opts.model ?? DEFAULT_OPENAI_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: opts.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS,
  };
  if (opts.schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
    };
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    try {
      log.debug('OpenAI chat request', { model, attempt, schema: opts.schema?.name });
      const result = await callOnce(body, apiKey);
      log.debug('OpenAI chat response', { model, tokens: result.tokens });
      return result;
    } catch (err) {
      const e = err as Error & { status?: number; retriable?: boolean };
      lastError = e;
      if (!e.retriable || attempt === OPENAI_MAX_ATTEMPTS) {
        log.error('OpenAI request failed (non-retryable or attempts exhausted)', {
          attempt,
          status: e.status,
          err: e,
        });
        throw e;
      }
      const delay = Math.min(OPENAI_BACKOFF_BASE_MS * 2 ** (attempt - 1), OPENAI_BACKOFF_MAX_MS);
      log.warn('OpenAI request failed; retrying', {
        attempt,
        max_attempts: OPENAI_MAX_ATTEMPTS,
        status: e.status,
        delay_ms: delay,
        err_message: e.message,
      });
      await sleep(delay);
    }
  }
  throw lastError ?? new Error('OpenAI call failed with no recorded error');
}

async function callOnce(body: Record<string, unknown>, apiKey: string): Promise<ChatResult> {
  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`) as Error & {
      status: number;
      retriable: boolean;
    };
    error.status = res.status;
    error.retriable = res.status === 429 || res.status >= 500;
    throw error;
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { total_tokens?: number };
  };
  return {
    text: data.choices[0]?.message?.content ?? '',
    tokens: data.usage?.total_tokens ?? 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
