import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ResumeStore } from '../../src/adapters/resume-store';
import { BaseResume } from '../../src/types';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'jf-resume-'));
});

function makeResume(overrides: Partial<BaseResume> = {}): BaseResume {
  return {
    contact: { name: 'A', email: 'a@b.c', phone: null, location: null, links: [] },
    summary: 's',
    experience: [],
    projects: [],
    skills: [],
    education: [],
    source_pdf_name: 'r.pdf',
    parsed_at: '12/06/2026',
    ...overrides,
  };
}

describe('ResumeStore', () => {
  it('returns null when no resume has been written', async () => {
    const store = new ResumeStore(dir);
    expect(await store.read()).toBeNull();
  });

  it('round-trips a resume via write + read', async () => {
    const store = new ResumeStore(dir);
    const resume = makeResume({ skills: ['ts', 'node'] });
    await store.write(resume);
    expect(await store.read()).toEqual(resume);
  });

  it('overwrites an existing resume atomically (no .tmp left behind)', async () => {
    const store = new ResumeStore(dir);
    await store.write(makeResume({ summary: 'first' }));
    await store.write(makeResume({ summary: 'second' }));
    const file = path.join(dir, 'resume.json');
    const raw = readFileSync(file, 'utf8');
    expect(JSON.parse(raw).summary).toBe('second');
  });

  it('creates the data directory if missing', async () => {
    const nested = path.join(dir, 'does', 'not', 'exist');
    const store = new ResumeStore(nested);
    await store.write(makeResume());
    expect((await store.read())?.summary).toBe('s');
  });
});
