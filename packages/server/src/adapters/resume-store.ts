import { promises as fs } from 'fs';
import path from 'path';
import { sanitizeResume } from '../core/sanitize-text';
import { BaseResume } from '../types';

const FILE_NAME = 'resume.json';

export class ResumeStore {
  constructor(private dataDir: string) {}

  async read(): Promise<BaseResume | null> {
    const file = path.join(this.dataDir, FILE_NAME);
    try {
      const raw = await fs.readFile(file, 'utf8');
      return sanitizeResume(JSON.parse(raw) as BaseResume);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async write(resume: BaseResume): Promise<void> {
    const file = path.join(this.dataDir, FILE_NAME);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(sanitizeResume(resume), null, 2), 'utf8');
    await fs.rename(tmp, file);
  }
}
