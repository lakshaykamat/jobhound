import { describe, expect, it } from 'vitest';
import { sanitizeResume, sanitizeText } from '../../src/core/sanitize-text';

describe('sanitizeText', () => {
  it('replaces PUA codepoints with a space', () => {
    expect(sanitizeText('91 9958125355')).toBe('91 9958125355');
    expect(sanitizeText('CGPA 7.7')).toBe('CGPA 7.7');
  });

  it('collapses the space left behind by an inner PUA char', () => {
    expect(sanitizeText('Profiled N1 query patterns')).toBe('Profiled N 1 query patterns');
  });

  it('strips ASCII control characters and keeps newlines', () => {
    expect(sanitizeText('HelloWorld')).toBe('Hello World');
    expect(sanitizeText('Line1\nLine2')).toBe('Line1\nLine2');
    expect(sanitizeText('Col1\tCol2')).toBe('Col1 Col2');
  });

  it('NFKC-normalizes fullwidth and compatibility forms', () => {
    expect(sanitizeText('ＡＢＣ')).toBe('ABC');
  });

  it('trims surrounding whitespace and collapses interior runs', () => {
    expect(sanitizeText('  hello   world  ')).toBe('hello world');
  });
});

describe('sanitizeResume', () => {
  it('walks nested objects and arrays, cleaning every string field', () => {
    const cleaned = sanitizeResume({
      contact: { phone: '91 9958125355', email: 'a@b.com' },
      education: [{ details: 'CGPA 7.7' }],
      skills: ['Python', 'Redis'],
      junk: null,
      count: 3,
    });
    expect(cleaned).toEqual({
      contact: { phone: '91 9958125355', email: 'a@b.com' },
      education: [{ details: 'CGPA 7.7' }],
      skills: ['Python', 'Re dis'],
      junk: null,
      count: 3,
    });
  });
});
