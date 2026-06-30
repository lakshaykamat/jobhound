// PDF text extracted by pdf-parse sometimes contains Private Use Area
// codepoints (U+E000-U+F8FF and the two supplementary PUA blocks) when the
// source PDF uses a font with a custom CMap that lacks ToUnicode entries.
// Helvetica has no glyphs for those codepoints, so they render as garbage
// in generated suggestions and pollute the resume editor.

const PUA_BMP = new RegExp('[\\uE000-\\uF8FF]', 'g');
const PUA_SUP = new RegExp('[\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}]', 'gu');
const CONTROL_EXCEPT_TAB_AND_NEWLINE = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F]', 'g');

export function sanitizeText(input: string): string {
  return input
    .replace(PUA_BMP, ' ')
    .replace(PUA_SUP, ' ')
    .normalize('NFKC')
    .replace(CONTROL_EXCEPT_TAB_AND_NEWLINE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

export function sanitizeResume<T>(resume: T): T {
  return walk(resume) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v);
    return out;
  }
  return value;
}
