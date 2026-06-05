import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ageInDaysFromIso, parsePostedAt } from '../../src/core/posted-at';

describe('parsePostedAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns null for null or empty input', () => {
    expect(parsePostedAt(null)).toBeNull();
    expect(parsePostedAt('')).toBeNull();
  });

  it('returns today for "just posted" or "today"', () => {
    expect(parsePostedAt('Just posted')).toBe('2026-06-05');
    expect(parsePostedAt('Today')).toBe('2026-06-05');
  });

  it('parses minutes and hours as today (0 days back)', () => {
    expect(parsePostedAt('5 minutes ago')).toBe('2026-06-05');
    expect(parsePostedAt('3 hours ago')).toBe('2026-06-05');
  });

  it('parses N days ago', () => {
    expect(parsePostedAt('3 days ago')).toBe('2026-06-02');
    expect(parsePostedAt('1 day ago')).toBe('2026-06-04');
  });

  it('parses N weeks ago as N*7 days', () => {
    expect(parsePostedAt('2 weeks ago')).toBe('2026-05-22');
  });

  it('parses months as N*30 days', () => {
    expect(parsePostedAt('1 month ago')).toBe('2026-05-06');
  });

  it('handles "30+ days ago" (plus sign tolerated)', () => {
    expect(parsePostedAt('30+ days ago')).toBe('2026-05-06');
  });

  it('returns null when no number+unit matches', () => {
    expect(parsePostedAt('recently')).toBeNull();
    expect(parsePostedAt('a while back')).toBeNull();
  });
});

describe('ageInDaysFromIso', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns null for null', () => {
    expect(ageInDaysFromIso(null)).toBeNull();
  });

  it('returns 0 for today', () => {
    expect(ageInDaysFromIso('2026-06-05')).toBe(0);
  });

  it('returns positive age for past dates', () => {
    expect(ageInDaysFromIso('2026-06-01')).toBe(4);
  });

  it('clamps negative (future) dates to 0', () => {
    expect(ageInDaysFromIso('2027-01-01')).toBe(0);
  });

  it('returns null for unparseable strings', () => {
    expect(ageInDaysFromIso('not-a-date')).toBeNull();
  });
});
