import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadConfig, validateConfig } from '../../src/config';
import { makeConfig } from '../_helpers/factories';

function writeConfig(data: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'jf-cfg-'));
  const p = path.join(dir, 'config.json');
  const withSecrets = {
    secrets: { serpapi_keys: ['test-serpapi-key'], openai_key: 'test-openai-key' },
    ...data,
  };
  writeFileSync(p, JSON.stringify(withSecrets), 'utf-8');
  return p;
}

describe('loadConfig', () => {
  it('throws when profile is missing', () => {
    const p = writeConfig({ cycle: { query: 'x' } });
    expect(() => loadConfig(p)).toThrow(/"profile"/);
  });

  it('uses singular "query" if "queries" is absent', () => {
    const p = writeConfig({
      cycle: { query: 'backend engineer' },
      profile: { skills: ['x'], role_titles: ['backend engineer'] },
    });
    const cfg = loadConfig(p);
    expect(cfg.cycle.queries).toEqual(['backend engineer']);
  });

  it('cross-products roles × locations into queries', () => {
    const p = writeConfig({
      cycle: {
        roles: ['backend engineer', 'sde'],
        locations: ['noida', 'gurgaon'],
      },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    const cfg = loadConfig(p);
    expect(cfg.cycle.queries).toEqual([
      'backend engineer noida',
      'backend engineer gurgaon',
      'sde noida',
      'sde gurgaon',
    ]);
  });

  it('uses roles as-is when locations is empty', () => {
    const p = writeConfig({
      cycle: { roles: ['backend engineer remote'] },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    const cfg = loadConfig(p);
    expect(cfg.cycle.queries).toEqual(['backend engineer remote']);
  });

  it('applies defaults for omitted sections', () => {
    const p = writeConfig({
      cycle: { queries: ['x'] },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    const cfg = loadConfig(p);
    expect(cfg.cycle.score_threshold).toBe(70);
    expect(cfg.serpapi.country).toBe('in');
    expect(cfg.openai.model).toBeTruthy();
    expect(cfg.server.poll_interval_seconds).toBeGreaterThanOrEqual(60);
    expect(cfg.server.http_port).toBeGreaterThan(0);
    expect(cfg.serpapi.platforms.length).toBeGreaterThan(0);
  });

  it('respects an explicit empty platforms array (disable filter)', () => {
    const p = writeConfig({
      cycle: { queries: ['x'] },
      serpapi: { platforms: [] },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    const cfg = loadConfig(p);
    expect(cfg.serpapi.platforms).toEqual([]);
  });

  it('normalizes platforms to lower-case trimmed strings', () => {
    const p = writeConfig({
      cycle: { queries: ['x'] },
      serpapi: { platforms: ['  LinkedIn  ', 'LEVER', ''] },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    const cfg = loadConfig(p);
    expect(cfg.serpapi.platforms).toEqual(['linkedin', 'lever']);
  });

  it('throws when neither queries nor query is provided', () => {
    const p = writeConfig({
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    expect(() => loadConfig(p)).toThrow(/queries|query/);
  });

  it('throws when score_threshold is out of range', () => {
    const p = writeConfig({
      cycle: { queries: ['x'], score_threshold: 150 },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    expect(() => loadConfig(p)).toThrow(/score_threshold/);
  });

  it('throws when axis weights do not sum to 100', () => {
    const p = writeConfig({
      cycle: { queries: ['x'] },
      scoring: {
        axis_weights: {
          skills_match: 10,
          seniority_match: 10,
          location_match: 10,
          comp_match: 10,
          domain_match: 10,
          recency: 10,
        },
      },
      profile: { skills: ['s'], role_titles: ['r'] },
    });
    expect(() => loadConfig(p)).toThrow(/sum to 100/);
  });
});

describe('validateConfig', () => {
  it('passes a baseline valid config', () => {
    expect(() => validateConfig(makeConfig())).not.toThrow();
  });

  it('rejects an invalid country code', () => {
    const cfg = makeConfig({ serpapi: { country: 'IND', language: 'en', platforms: [] } });
    expect(() => validateConfig(cfg)).toThrow(/country/);
  });

  it('rejects an invalid language code', () => {
    const cfg = makeConfig({ serpapi: { country: 'in', language: 'english', platforms: [] } });
    expect(() => validateConfig(cfg)).toThrow(/language/);
  });

  it('rejects poll_interval_seconds < 60', () => {
    const cfg = makeConfig({ server: { poll_interval_seconds: 30 } });
    expect(() => validateConfig(cfg)).toThrow(/poll_interval_seconds/);
  });

  it('rejects empty profile skills or role titles', () => {
    expect(() => validateConfig(makeConfig({ profile: { skills: [] } }))).toThrow(
      /profile.skills/,
    );
  });
});
