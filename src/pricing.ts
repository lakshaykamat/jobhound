export interface ModelPrice {
  input_per_mtok: number;
  output_per_mtok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-5.2': { input_per_mtok: 1.25, output_per_mtok: 10.0 },
  'gpt-4o': { input_per_mtok: 2.5, output_per_mtok: 10.0 },
  'gpt-4o-mini': { input_per_mtok: 0.15, output_per_mtok: 0.6 },
};

const FALLBACK_BLENDED_PER_MTOK = 5.0;

export function costUsd(model: string, tokens: number): number {
  const price = MODEL_PRICES[model];
  const perMtok = price
    ? (price.input_per_mtok + price.output_per_mtok) / 2
    : FALLBACK_BLENDED_PER_MTOK;
  return (tokens / 1_000_000) * perMtok;
}
