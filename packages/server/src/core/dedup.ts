import { createHash } from 'crypto';
import { DedupStrategy, JobRecord, RawPosting } from '../types';

export interface IdentifiedPosting {
  jobId: string;
  posting: RawPosting;
}

export interface DedupSplit {
  fresh: IdentifiedPosting[];
  touch: JobRecord[];
}

export function computeJobId(
  posting: Pick<RawPosting, 'title' | 'company' | 'via'>,
  strategy: DedupStrategy,
): string {
  const parts =
    strategy === 'title_company'
      ? [normalize(posting.title), normalize(posting.company)]
      : [normalize(posting.title), normalize(posting.company), normalize(posting.via)];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

export function splitByKnown(
  postings: RawPosting[],
  existing: JobRecord[],
  strategy: DedupStrategy,
): DedupSplit {
  const existingById = new Map(existing.map((r) => [r.job_id, r]));
  const seenInCycle = new Set<string>();

  const fresh: IdentifiedPosting[] = [];
  const touch: JobRecord[] = [];

  for (const posting of postings) {
    const jobId = computeJobId(posting, strategy);
    if (seenInCycle.has(jobId)) continue;
    seenInCycle.add(jobId);

    const known = existingById.get(jobId);
    if (known) {
      touch.push(known);
    } else {
      fresh.push({ jobId, posting });
    }
  }

  return { fresh, touch };
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
