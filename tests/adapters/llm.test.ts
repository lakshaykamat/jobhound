import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chat } from '../../src/adapters/llm';
import { installFetchMock, jsonResponse, fakeResponse } from '../_helpers/fetch-mock';

let fetchMock: ReturnType<typeof installFetchMock>;

describe('llm.chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = installFetchMock();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts to the OpenAI endpoint with bearer auth and parses content', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: 'hello world' } }],
        usage: { total_tokens: 42 },
      }),
    );

    const res = await chat(
      [{ role: 'user', content: 'hi' }],
      'sk-test',
      { maxTokens: 100, model: 'gpt-4o-mini' },
    );
    expect(res.text).toBe('hello world');
    expect(res.tokens).toBe(42);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('openai.com');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_completion_tokens).toBe(100);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('attaches json_schema response_format when a schema is given', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '{}' } }],
        usage: { total_tokens: 1 },
      }),
    );
    await chat(
      [{ role: 'system', content: 's' }],
      'k',
      {
        maxTokens: 50,
        schema: { name: 'thing', schema: { type: 'object' } },
      },
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('thing');
  });

  it('retries on 5xx and succeeds', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 503, body: 'oops' }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 1 } }),
    );

    const p = chat([{ role: 'user', content: 'hi' }], 'k', { maxTokens: 10 });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 400-class non-429 errors', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 400, body: 'bad' }));
    const assertion = expect(
      chat([{ role: 'user', content: 'hi' }], 'k', { maxTokens: 10 }),
    ).rejects.toThrow(/HTTP 400/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns empty text and 0 tokens when choices/usage are missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [] }));
    const res = await chat([{ role: 'user', content: 'hi' }], 'k', { maxTokens: 10 });
    expect(res.text).toBe('');
    expect(res.tokens).toBe(0);
  });
});
