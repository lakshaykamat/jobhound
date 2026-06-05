import { vi, type Mock } from 'vitest';

export interface FakeResponseOptions {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

export function fakeResponse({ status = 200, body = '{}', headers = {} }: FakeResponseOptions = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue(safeJson(body)),
  } as unknown as Response;
}

export function jsonResponse(body: unknown, status = 200) {
  return fakeResponse({ status, body: JSON.stringify(body) });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export function installFetchMock(): Mock {
  const m = vi.fn();
  vi.stubGlobal('fetch', m);
  return m;
}
