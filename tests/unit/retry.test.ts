import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retry } from '../../src/adapters/retry';
import { Logger } from '../../src/logger';

const silentLog = new Logger();

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, {
      label: 't',
      maxAttempts: 3,
      backoffBaseMs: 1,
      backoffMaxMs: 1,
      shouldRetry: () => true,
      log: silentLog,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries with exponential backoff up to maxAttempts', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('ok');

    const p = retry(fn, {
      label: 't',
      maxAttempts: 3,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      shouldRetry: () => true,
      log: silentLog,
    });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    const assertion = expect(
      retry(fn, {
        label: 't',
        maxAttempts: 2,
        backoffBaseMs: 1,
        backoffMaxMs: 1,
        shouldRetry: () => true,
        log: silentLog,
      }),
    ).rejects.toThrow('always fails');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'));
    const assertion = expect(
      retry(fn, {
        label: 't',
        maxAttempts: 5,
        backoffBaseMs: 1,
        backoffMaxMs: 1,
        shouldRetry: () => false,
        log: silentLog,
      }),
    ).rejects.toThrow('nope');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledOnce();
  });
});
