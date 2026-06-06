import { describe, it, expect } from 'vitest';
import { MODEL_PRICES, costUsd } from '../../src/pricing';

describe('pricing.costUsd', () => {
  it('returns 0 for 0 tokens regardless of model', () => {
    expect(costUsd('gpt-5.2', 0)).toBe(0);
    expect(costUsd('unknown-model', 0)).toBe(0);
  });

  it('uses blended (input+output)/2 rate for known models', () => {
    const price = MODEL_PRICES['gpt-4o-mini'];
    const blended = (price.input_per_mtok + price.output_per_mtok) / 2;
    const tokens = 1_000_000;
    expect(costUsd('gpt-4o-mini', tokens)).toBeCloseTo(blended, 10);
  });

  it('scales linearly with tokens', () => {
    const a = costUsd('gpt-5.2', 1_000);
    const b = costUsd('gpt-5.2', 10_000);
    expect(b / a).toBeCloseTo(10, 6);
  });

  it('falls back to a non-zero blended rate for unknown models', () => {
    expect(costUsd('totally-fake-model', 1_000_000)).toBeGreaterThan(0);
  });

  it('returns the same cost for equal token counts on the same model', () => {
    expect(costUsd('gpt-4o', 12345)).toBe(costUsd('gpt-4o', 12345));
  });
});
