import { describe, expect, it } from 'vitest';
import { scoreKeywords } from '../../src/core/keyword-score';
import { makeTailoredResume } from '../_helpers/factories';

describe('scoreKeywords', () => {
  it('returns score 1.0 when every keyword appears', () => {
    const tailored = makeTailoredResume({
      summary: 'I build APIs using TypeScript and Node.js on Kubernetes.',
    });
    const result = scoreKeywords(['TypeScript', 'Kubernetes'], tailored);
    expect(result.score).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.matched).toEqual(['TypeScript', 'Kubernetes']);
  });

  it('flags missing keywords', () => {
    const tailored = makeTailoredResume({ summary: 'I write TypeScript.' });
    const result = scoreKeywords(['TypeScript', 'Terraform'], tailored);
    expect(result.matched).toEqual(['TypeScript']);
    expect(result.missing).toEqual(['Terraform']);
    expect(result.score).toBe(0.5);
  });

  it('matches with plural / -ing stems', () => {
    const tailored = makeTailoredResume({
      summary: 'Built scalable microservices and analyzed system performance.',
    });
    const result = scoreKeywords(['microservice', 'analyze'], tailored);
    expect(result.matched).toEqual(['microservice', 'analyze']);
  });

  it('is case-insensitive', () => {
    const tailored = makeTailoredResume({ summary: 'POSTGRESQL expert.' });
    const result = scoreKeywords(['postgresql'], tailored);
    expect(result.matched).toEqual(['postgresql']);
  });

  it('handles multi-word keywords as substring matches', () => {
    const tailored = makeTailoredResume({
      summary: 'Production experience with React Native at scale.',
    });
    const result = scoreKeywords(['React Native', 'machine learning'], tailored);
    expect(result.matched).toEqual(['React Native']);
    expect(result.missing).toEqual(['machine learning']);
  });

  it('does not falsely match a substring of a longer word', () => {
    const tailored = makeTailoredResume({ summary: 'I lead reactions to incidents.' });
    const result = scoreKeywords(['React'], tailored);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(['React']);
  });

  it('searches the entire flattened resume, not only the summary', () => {
    const tailored = makeTailoredResume({
      summary: '',
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          dates: '2024',
          location: null,
          bullets: [{ text: 'Owned Postgres replication topology.', jd_relevance: 0.9 }],
        },
      ],
    });
    const result = scoreKeywords(['Postgres'], tailored);
    expect(result.matched).toEqual(['Postgres']);
  });

  it('returns score 0 when no keywords are given', () => {
    const result = scoreKeywords([], makeTailoredResume());
    expect(result).toEqual({ matched: [], missing: [], score: 0 });
  });

  it('ignores whitespace-only keywords', () => {
    const tailored = makeTailoredResume({ summary: 'TypeScript.' });
    const result = scoreKeywords(['TypeScript', '   '], tailored);
    expect(result.matched).toEqual(['TypeScript']);
    expect(result.missing).toEqual([]);
  });

  it('matches slash-compound keywords when any side is present', () => {
    const tailored = makeTailoredResume({ skills: ['PostgreSQL', 'Redis'] });
    const result = scoreKeywords(['MySQL/PostgreSQL', 'Django/Flask'], tailored);
    expect(result.matched).toEqual(['MySQL/PostgreSQL']);
    expect(result.missing).toEqual(['Django/Flask']);
  });

  it('strips filler qualifiers like "Basics" / "Fundamentals" / "Strong"', () => {
    const tailored = makeTailoredResume({ skills: ['Nginx', 'Linux'] });
    const result = scoreKeywords(
      ['NGINX Basics', 'Linux Fundamentals', 'Strong DSA Knowledge'],
      tailored,
    );
    expect(result.matched).toEqual(['NGINX Basics', 'Linux Fundamentals']);
    expect(result.missing).toEqual(['Strong DSA Knowledge']);
  });

  it('splits ampersand-joined compounds and matches any atomic piece', () => {
    const tailored = makeTailoredResume({ skills: ['Redis'] });
    const result = scoreKeywords(['Redis & Caching'], tailored);
    expect(result.matched).toEqual(['Redis & Caching']);
  });
});
