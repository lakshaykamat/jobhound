import { ONE_PAGE_MAX_HEIGHT, ONE_PAGE_SAFETY_BUFFER, measureResume } from '../adapters/resume-pdf';
import { BulletSection, DroppedBullet, TailoredResume } from '../types';

const FIT_LIMIT = ONE_PAGE_MAX_HEIGHT - ONE_PAGE_SAFETY_BUFFER;

export interface FitResult {
  trimmed: TailoredResume;
  dropped: DroppedBullet[];
  truncated: boolean;
}

interface BulletRef {
  section: BulletSection;
  section_index: number;
  bullet_index: number;
  jd_relevance: number;
}

export function fitToOnePage(tailored: TailoredResume): FitResult {
  const dropped: DroppedBullet[] = [];
  let current = cloneTailored(tailored);

  while (measureResume(current) > FIT_LIMIT) {
    const candidates = listRemovableBullets(current);
    if (candidates.length === 0) {
      return { trimmed: current, dropped, truncated: true };
    }
    const victim = lowestRelevance(candidates);
    const dropMeta = removeBullet(current, victim);
    dropped.push(dropMeta);
  }

  return { trimmed: current, dropped, truncated: false };
}

function listRemovableBullets(tailored: TailoredResume): BulletRef[] {
  const refs: BulletRef[] = [];
  tailored.experience.forEach((job, sIdx) => {
    if (job.bullets.length <= 1) return;
    job.bullets.forEach((b, bIdx) =>
      refs.push({ section: 'experience', section_index: sIdx, bullet_index: bIdx, jd_relevance: b.jd_relevance }),
    );
  });
  tailored.projects.forEach((proj, sIdx) => {
    if (proj.bullets.length <= 1) return;
    proj.bullets.forEach((b, bIdx) =>
      refs.push({ section: 'projects', section_index: sIdx, bullet_index: bIdx, jd_relevance: b.jd_relevance }),
    );
  });
  return refs;
}

function lowestRelevance(refs: BulletRef[]): BulletRef {
  return refs.reduce((min, ref) => (ref.jd_relevance < min.jd_relevance ? ref : min));
}

function removeBullet(tailored: TailoredResume, ref: BulletRef): DroppedBullet {
  const target = ref.section === 'experience' ? tailored.experience[ref.section_index] : tailored.projects[ref.section_index];
  const [removed] = target.bullets.splice(ref.bullet_index, 1);
  return {
    section: ref.section,
    section_index: ref.section_index,
    bullet_text: removed.text,
    reason: 'one-page-fit',
  };
}

function cloneTailored(tailored: TailoredResume): TailoredResume {
  return JSON.parse(JSON.stringify(tailored)) as TailoredResume;
}
