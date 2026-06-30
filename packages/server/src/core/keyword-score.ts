import { BaseResume, KeywordScore, TailoredResume } from '../types';

type ResumeForKeywordScore = BaseResume | TailoredResume;

export function scoreKeywords(keywords: string[], resume: ResumeForKeywordScore): KeywordScore {
  const haystack = flattenResumeText(resume).toLowerCase();
  return scoreAgainstText(keywords, haystack);
}

export function scoreKeywordsBase(keywords: string[], base: BaseResume): KeywordScore {
  return scoreKeywords(keywords, base);
}

function scoreAgainstText(keywords: string[], haystack: string): KeywordScore {
  const stems = collectStems(haystack);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (keyword.length === 0) continue;
    if (isInvalidKeywordNote(keyword)) continue;
    if (matchesKeyword(keyword, haystack, stems)) matched.push(raw);
    else missing.push(raw);
  }

  const total = matched.length + missing.length;
  const score = total === 0 ? 0 : matched.length / total;
  return { matched, missing, score };
}

function flattenResumeText(resume: ResumeForKeywordScore): string {
  const parts: string[] = [];
  const push = (s: string | null | undefined) => { if (s && s.length > 0) parts.push(s); };

  push(resume.contact.name);
  push(resume.contact.email);
  push(resume.contact.phone);
  push(resume.contact.location);
  for (const link of resume.contact.links) { push(link.label); push(link.url); }
  push(resume.summary);
  for (const job of resume.experience) {
    push(job.company); push(job.title); push(job.dates); push(job.location);
    for (const b of job.bullets) push(typeof b === 'string' ? b : b.text);
  }
  for (const proj of resume.projects) {
    push(proj.name); push(proj.link);
    for (const b of proj.bullets) push(typeof b === 'string' ? b : b.text);
  }
  for (const skill of resume.skills) push(skill);
  for (const edu of resume.education) {
    push(edu.school); push(edu.degree); push(edu.dates); push(edu.details);
  }
  return parts.join(' ');
}

function matchesKeyword(keyword: string, haystack: string, stems: Set<string>): boolean {
  for (const variant of keywordVariants(keyword)) {
    if (matchesSingleOrPhrase(variant, haystack, stems)) return true;
  }

  // Safety net for compound JD phrases the LLM didn't split into atomic terms
  // (e.g. "MySQL/PostgreSQL", "NGINX Basics", "Strong DSA Knowledge"). Split
  // on common separators, strip filler qualifiers, and accept if ANY atomic
  // piece is in the resume — JD compounds are usually "either-of" lists.
  const atomic = splitAtomic(keyword);
  if (atomic.length === 0) return false;
  const normalized = atomic.map((s) => s.toLowerCase()).join(' ');
  if (normalized === keyword.trim().toLowerCase()) return false;
  return atomic.some((token) => matchesSingleOrPhrase(token, haystack, stems));
}

function matchesSingleOrPhrase(keyword: string, haystack: string, stems: Set<string>): boolean {
  const lower = keyword.toLowerCase().trim();
  if (lower.length === 0) return false;
  if (/\s/.test(lower)) {
    if (haystack.includes(lower)) return true;
    const phraseTokens = tokenize(lower).filter((t) => !FILLER_TOKENS.has(t));
    return phraseTokens.length > 0 && phraseTokens.every((token) => {
      for (const variant of stemVariants(token)) {
        if (stems.has(variant)) return true;
      }
      return false;
    });
  }
  for (const variant of stemVariants(lower)) {
    if (stems.has(variant)) return true;
  }
  return false;
}

const FILLER_TOKENS = new Set([
  'basics', 'basic', 'fundamentals', 'fundamental', 'knowledge',
  'experience', 'strong', 'working', 'proficient', 'familiar',
  'familiarity', 'hands-on', 'expert', 'expertise', 'understanding',
  'with', 'in', 'of', 'the', 'a', 'an', 'needed', 'required',
]);

function isInvalidKeywordNote(keyword: string): boolean {
  return /\bnot\s+(?:in|from|part\s+of)\s+(?:the\s+)?jd\b/i.test(keyword)
    || /\bnot\s+required\b/i.test(keyword)
    || /\bnot\s+(?:a\s+)?(?:must|requirement)\b/i.test(keyword);
}

function keywordVariants(keyword: string): string[] {
  const variants = new Set<string>();
  variants.add(keyword);

  const withoutParens = keyword.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutParens.length > 0) variants.add(withoutParens);

  const parenMatches = keyword.matchAll(/\(([^)]*)\)/g);
  for (const match of parenMatches) {
    const content = match[1]?.trim();
    if (content && !isInvalidKeywordNote(content)) variants.add(content);
  }

  return [...variants];
}

function splitAtomic(keyword: string): string[] {
  return keyword
    .split(/[/&,]|\s+(?:and|or|vs)\s+/i)
    .map((p) => stripFiller(p.trim()))
    .filter((p) => p.length > 0);
}

function stripFiller(phrase: string): string {
  const kept = phrase.split(/\s+/).filter((t) => !FILLER_TOKENS.has(t.toLowerCase()));
  return kept.length > 0 ? kept.join(' ') : phrase;
}

function collectStems(haystack: string): Set<string> {
  const stems = new Set<string>();
  for (const token of tokenize(haystack)) {
    for (const variant of stemVariants(token)) stems.add(variant);
  }
  return stems;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+#-]+/)
    .map((t) => t.replace(/[.,;:!?]+$/g, ''))
    .filter((t) => t.length > 0);
}

function stemVariants(word: string): string[] {
  const variants = new Set([word]);
  if (word.length > 4 && word.endsWith('ing')) {
    variants.add(word.slice(0, -3));
    variants.add(`${word.slice(0, -3)}e`);
  }
  if (word.length > 4 && word.endsWith('ed')) {
    variants.add(word.slice(0, -2));
    variants.add(word.slice(0, -1));
  }
  if (word.length > 4 && word.endsWith('ies')) variants.add(`${word.slice(0, -3)}y`);
  if (word.length > 3 && word.endsWith('es')) variants.add(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s')) variants.add(word.slice(0, -1));
  return [...variants];
}
