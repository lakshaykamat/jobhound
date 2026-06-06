import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsSheet } from '../../src/adapters/sheets';
import { fakeResponse, installFetchMock, jsonResponse } from '../_helpers/fetch-mock';
import { makeRecord } from '../_helpers/factories';

let fetchMock: ReturnType<typeof installFetchMock>;
const url = 'https://script.google.com/macros/s/AKfycb/exec';
const token = 'secret-token';

describe('JobsSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = installFetchMock();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('ensureHeader posts the right envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sheet = new JobsSheet(url, token);
    await sheet.ensureHeader();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.action).toBe('ensureHeader');
    expect(body.token).toBe(token);
  });

  it('readAll returns records array', async () => {
    const records = [makeRecord({ job_id: 'a' }), makeRecord({ job_id: 'b' })];
    fetchMock.mockResolvedValueOnce(jsonResponse({ records }));
    const sheet = new JobsSheet(url, token);
    const out = await sheet.readAll();
    expect(out.map((r) => r.job_id)).toEqual(['a', 'b']);
  });

  it('readAll returns [] when records is undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const sheet = new JobsSheet(url, token);
    expect(await sheet.readAll()).toEqual([]);
  });

  it('upsertBatch returns zeros for empty input without HTTP', async () => {
    const sheet = new JobsSheet(url, token);
    const res = await sheet.upsertBatch([]);
    expect(res).toEqual({ inserted: 0, updated: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upsertBatch chunks records over SHEET_UPSERT_CHUNK_SIZE', async () => {
    const records = Array.from({ length: 250 }, (_, i) => makeRecord({ job_id: `j${i}` }));
    fetchMock.mockResolvedValue(jsonResponse({ inserted: 100, updated: 0 }));
    const sheet = new JobsSheet(url, token);
    const res = await sheet.upsertBatch(records);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(res.inserted).toBe(300); // 100 * 3 (we set fixed mock; check call count is the contract)
  });

  it('rejects when Apps Script returns an error field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad token' }));
    const sheet = new JobsSheet(url, token);
    await expect(sheet.ensureHeader()).rejects.toThrow(/bad token/);
  });

  it('treats HTML response as a deploy-misconfigured error and retries', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ status: 200, body: '<!DOCTYPE html><html>access denied</html>' }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sheet = new JobsSheet(url, token);
    const p = sheet.ensureHeader();
    await vi.runAllTimersAsync();
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 502, body: 'gw' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sheet = new JobsSheet(url, token);
    const p = sheet.ensureHeader();
    await vi.runAllTimersAsync();
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('selfTest passes through the results payload', async () => {
    const results = [{ check: 'header', ok: true, detail: 'present' }];
    fetchMock.mockResolvedValueOnce(jsonResponse({ results }));
    const sheet = new JobsSheet(url, token);
    const out = await sheet.selfTest();
    expect(out.results).toEqual(results);
  });

  it('bulkImport returns 0 for empty input and otherwise chunks', async () => {
    const sheet = new JobsSheet(url, token);
    expect(await sheet.bulkImport([])).toEqual({ inserted: 0 });

    fetchMock.mockResolvedValue(jsonResponse({ inserted: 50 }));
    const records = Array.from({ length: 120 }, (_, i) => makeRecord({ job_id: `j${i}` }));
    const out = await sheet.bulkImport(records);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.inserted).toBe(100);
  });
});
