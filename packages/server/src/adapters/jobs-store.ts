import { promises as fs } from 'fs';
import path from 'path';
import { JobRecord } from '../types';

const FILE_NAME = 'jobs.json';

export class JobsStore {
  private cache: JobRecord[] | null = null;

  constructor(private dataDir: string) {}

  async readAll(): Promise<JobRecord[]> {
    if (this.cache) return this.cache;
    this.cache = await loadFromDisk(path.join(this.dataDir, FILE_NAME));
    return this.cache;
  }

  async upsertBatch(records: JobRecord[]): Promise<{ inserted: number; updated: number }> {
    if (records.length === 0) return { inserted: 0, updated: 0 };
    const current = await this.readAll();
    const byId = new Map(current.map((r) => [r.job_id, r]));

    let inserted = 0;
    let updated = 0;
    for (const r of records) {
      if (byId.has(r.job_id)) updated++;
      else inserted++;
      byId.set(r.job_id, r);
    }
    this.cache = Array.from(byId.values());
    await writeAtomic(path.join(this.dataDir, FILE_NAME), this.cache);
    return { inserted, updated };
  }
}

async function loadFromDisk(file: string): Promise<JobRecord[]> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JobRecord[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAtomic(file: string, records: JobRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tmp, file);
}
