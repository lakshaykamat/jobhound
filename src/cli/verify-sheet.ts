import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { JobsSheet } from '../adapters/sheets';
import { Tracker, newCycleId } from '../adapters/tracker';

async function main(): Promise<void> {
  const env = requireEnv(['APPS_SCRIPT_URL', 'APPS_SCRIPT_TOKEN']);
  const sheet = new JobsSheet(env.APPS_SCRIPT_URL, env.APPS_SCRIPT_TOKEN);

  let passed = 0;
  let failed = 0;

  const check = async (name: string, fn: () => Promise<string | void>): Promise<void> => {
    try {
      const detail = await fn();
      console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${name} — ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  };

  console.log('=== Sheet read checks (Jobs tab, no writes) ===');
  await check('ensureHeader (Jobs tab)', async () => {
    await sheet.ensureHeader();
    return 'header present';
  });
  await check('readAll (Jobs tab)', async () => {
    const rows = await sheet.readAll();
    return `${rows.length} row(s)`;
  });

  console.log('\n=== Sheet write checks (temporary sheet, auto-deleted) ===');
  try {
    const { results } = await sheet.selfTest();
    for (const r of results) {
      if (r.ok) {
        console.log(`  PASS  ${r.check} — ${r.detail}`);
        passed++;
      } else {
        console.log(`  FAIL  ${r.check} — ${r.detail}`);
        failed++;
      }
    }
  } catch (err) {
    console.log(`  FAIL  selfTest — ${err instanceof Error ? err.message : err}`);
    failed++;
  }

  console.log('\n=== Tracker checks (.data write + read in tmp dir) ===');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'job-finder-tracker-'));
  try {
    const tracker = new Tracker(tmpDir);
    await check('recordJobEvent → jobs.jsonl', async () => {
      tracker.recordJobEvent({
        timestamp: new Date().toISOString(),
        cycle_id: 'verify',
        job_id: 'verify-job',
        action: 'found',
        title: 'verify',
        company: 'verify',
        via: 'verify',
      });
      await tracker.flushJobEvents();
      const body = await fs.readFile(path.join(tmpDir, 'jobs.jsonl'), 'utf8');
      const lines = body.trim().split('\n').length;
      return `${lines} line(s) written`;
    });
    await check('recordCycle → cycles.jsonl + usage rollup', async () => {
      await tracker.recordCycle({
        cycle_id: newCycleId(),
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        searches_used: 1,
        tokens_used: 100,
        cost_usd: 0.001,
        found: 0,
        new: 0,
        known: 0,
        scored: 0,
        filtered: 0,
        inserted: 0,
        updated: 0,
        stale: 0,
        errored: 0,
      });
      const usage = await tracker.monthlyUsage();
      return `month ${usage.month}: ${usage.searches} searches, ${usage.tokens} tokens, $${usage.cost_usd}`;
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

function requireEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (!v) throw new Error(`${k} env var required`);
    out[k] = v;
  }
  return out;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
