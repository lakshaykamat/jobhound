import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_API_URL,
  OPENAI_BACKOFF_BASE_MS,
  OPENAI_BACKOFF_MAX_MS,
  OPENAI_MAX_ATTEMPTS,
} from '../constants';
import { Logger, logger as rootLogger } from '../logger';
import { retry } from './retry';

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
  maxTokens: number;
  schema?: JsonSchemaSpec;
  log?: Logger;
}

export interface ChatResult {
  text: string;
  tokens: number;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function chat(
  messages: ChatMessage[],
  apiKey: string,
  opts: ChatOptions,
): Promise<ChatResult> {
  const log = opts.log ?? rootLogger;
  const model = opts.model ?? DEFAULT_OPENAI_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: opts.maxTokens,
  };
  if (opts.schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
    };
  }

  return retry(() => callOnce(body, apiKey), {
    label: 'OpenAI chat',
    maxAttempts: OPENAI_MAX_ATTEMPTS,
    backoffBaseMs: OPENAI_BACKOFF_BASE_MS,
    backoffMaxMs: OPENAI_BACKOFF_MAX_MS,
    shouldRetry: (err) =>
      err instanceof HttpError ? err.status === 429 || err.status >= 500 : true,
    log,
  });
}

async function callOnce(body: Record<string, unknown>, apiKey: string): Promise<ChatResult> {
  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(res.status, `OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`);
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
