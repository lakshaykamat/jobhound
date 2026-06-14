import PDFDocument from 'pdfkit';
import { ContactBlock, ResumeEducation, TailoredJob, TailoredProject, TailoredResume } from '../types';

const PAGE_SIZE = 'LETTER' as const;
const MARGIN = 36;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = 540;

export const ONE_PAGE_MAX_HEIGHT = PAGE_HEIGHT - MARGIN * 2;

const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const FONT_OBLIQUE = 'Helvetica-Oblique';

const SIZE_NAME = 20;
const SIZE_CONTACT = 9.5;
const SIZE_SECTION = 10.5;
const SIZE_ROLE = 11;
const SIZE_BODY = 10;
const SIZE_DATES = 9.5;

const GAP_AFTER_NAME = 5;
const GAP_AFTER_CONTACT = 16;
const GAP_AFTER_SECTION_HEAD = 7;
const GAP_AFTER_SECTION = 12;
const GAP_BETWEEN_ENTRIES = 8;
const GAP_AFTER_ROLE_LINE = 4;
const BULLET_INDENT = 12;

// Cap how much slack we inject between sections so a short resume doesn't
// look stretched. Anything beyond the cap just becomes bottom margin.
const MAX_EXTRA_GAP_PER_SECTION = 22;

// Leave a small buffer below the last section so floating-point measurement
// drift can't tip the last line onto page 2.
export const ONE_PAGE_SAFETY_BUFFER = 12;

export async function renderResume(tailored: TailoredResume): Promise<Buffer> {
  const doc = new PDFDocument({ size: PAGE_SIZE, margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const sections: Array<() => void> = [];
  if (tailored.skills.length > 0) sections.push(() => drawSkills(doc, tailored.skills));
  if (tailored.summary.trim().length > 0) sections.push(() => drawSummary(doc, tailored.summary));
  if (tailored.experience.length > 0) sections.push(() => drawExperience(doc, tailored.experience));
  if (tailored.projects.length > 0) sections.push(() => drawProjects(doc, tailored.projects));
  if (tailored.education.length > 0) sections.push(() => drawEducation(doc, tailored.education));

  const slack = Math.max(0, ONE_PAGE_MAX_HEIGHT - measureResume(tailored) - ONE_PAGE_SAFETY_BUFFER);
  const extraGap = sections.length > 1
    ? Math.min(MAX_EXTRA_GAP_PER_SECTION, slack / (sections.length - 1))
    : 0;

  drawHeader(doc, tailored.contact);
  sections.forEach((draw, i) => {
    draw();
    if (i < sections.length - 1 && extraGap > 0) doc.moveDown(extraGap / SIZE_BODY);
  });

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

export function measureResume(tailored: TailoredResume): number {
  const doc = new PDFDocument({ size: PAGE_SIZE, margin: MARGIN });
  let total = measureHeader(doc, tailored.contact);
  if (tailored.skills.length > 0) total += measureSkills(doc, tailored.skills);
  if (tailored.summary.trim().length > 0) total += measureSummary(doc, tailored.summary);
  if (tailored.experience.length > 0) total += measureExperience(doc, tailored.experience);
  if (tailored.projects.length > 0) total += measureProjects(doc, tailored.projects);
  if (tailored.education.length > 0) total += measureEducation(doc, tailored.education);
  doc.end();
  return total;
}

// ---------- header ----------

function drawHeader(doc: PDFKit.PDFDocument, contact: ContactBlock): void {
  doc.font(FONT_BOLD).fontSize(SIZE_NAME).text(contact.name || '', { align: 'left' });
  doc.moveDown(GAP_AFTER_NAME / SIZE_NAME);
  const line = contactLine(contact);
  if (line.length > 0) {
    doc.font(FONT_REGULAR).fontSize(SIZE_CONTACT).fillColor('#404040').text(line, { align: 'left' });
    doc.fillColor('black');
  }
  doc.moveDown(GAP_AFTER_CONTACT / SIZE_CONTACT);
}

function measureHeader(doc: PDFKit.PDFDocument, contact: ContactBlock): number {
  doc.font(FONT_BOLD).fontSize(SIZE_NAME);
  let h = doc.heightOfString(contact.name || ' ', { width: CONTENT_WIDTH, align: 'left' }) + GAP_AFTER_NAME;
  const line = contactLine(contact);
  if (line.length > 0) {
    doc.font(FONT_REGULAR).fontSize(SIZE_CONTACT);
    h += doc.heightOfString(line, { width: CONTENT_WIDTH, align: 'left' });
  }
  return h + GAP_AFTER_CONTACT;
}

function contactLine(contact: ContactBlock): string {
  const parts: string[] = [];
  if (contact.email) parts.push(contact.email);
  if (contact.phone) parts.push(contact.phone);
  if (contact.location) parts.push(contact.location);
  for (const link of contact.links) parts.push(link.url || link.label);
  return parts.filter((p) => p.length > 0).join('  •  ');
}

// ---------- section heading ----------

function drawSectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  doc.font(FONT_BOLD).fontSize(SIZE_SECTION).fillColor('#0a0a0a').text(label.toUpperCase(), { characterSpacing: 0.6 });
  const y = doc.y + 2;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
  doc.moveDown(GAP_AFTER_SECTION_HEAD / SIZE_SECTION);
}

function measureSectionHeading(doc: PDFKit.PDFDocument, label: string): number {
  doc.font(FONT_BOLD).fontSize(SIZE_SECTION);
  return doc.heightOfString(label.toUpperCase(), { width: CONTENT_WIDTH }) + 2 + GAP_AFTER_SECTION_HEAD;
}

// ---------- summary ----------

function drawSummary(doc: PDFKit.PDFDocument, summary: string): void {
  drawSectionHeading(doc, 'Summary');
  doc.font(FONT_REGULAR).fontSize(SIZE_BODY).text(summary, { width: CONTENT_WIDTH });
  doc.moveDown(GAP_AFTER_SECTION / SIZE_BODY);
}

function measureSummary(doc: PDFKit.PDFDocument, summary: string): number {
  let h = measureSectionHeading(doc, 'Summary');
  doc.font(FONT_REGULAR).fontSize(SIZE_BODY);
  h += doc.heightOfString(summary, { width: CONTENT_WIDTH });
  return h + GAP_AFTER_SECTION;
}

// ---------- experience ----------

function drawExperience(doc: PDFKit.PDFDocument, jobs: TailoredJob[]): void {
  drawSectionHeading(doc, 'Experience');
  jobs.forEach((job, i) => {
    drawRoleLine(doc, `${job.title}, ${job.company}`, job.dates);
    if (job.location) doc.font(FONT_OBLIQUE).fontSize(SIZE_DATES).fillColor('#737373').text(job.location, { width: CONTENT_WIDTH });
    doc.moveDown(GAP_AFTER_ROLE_LINE / SIZE_BODY);
    drawBullets(doc, job.bullets.map((b) => b.text));
    if (i < jobs.length - 1) doc.moveDown(GAP_BETWEEN_ENTRIES / SIZE_BODY);
  });
  doc.moveDown(GAP_AFTER_SECTION / SIZE_BODY);
}

function measureExperience(doc: PDFKit.PDFDocument, jobs: TailoredJob[]): number {
  let h = measureSectionHeading(doc, 'Experience');
  jobs.forEach((job, i) => {
    h += measureRoleLine(doc, `${job.title}, ${job.company}`, job.dates);
    if (job.location) {
      doc.font(FONT_OBLIQUE).fontSize(SIZE_DATES);
      h += doc.heightOfString(job.location, { width: CONTENT_WIDTH });
    }
    h += GAP_AFTER_ROLE_LINE;
    h += measureBullets(doc, job.bullets.map((b) => b.text));
    if (i < jobs.length - 1) h += GAP_BETWEEN_ENTRIES;
  });
  return h + GAP_AFTER_SECTION;
}

// ---------- projects ----------

function drawProjects(doc: PDFKit.PDFDocument, projects: TailoredProject[]): void {
  drawSectionHeading(doc, 'Projects');
  projects.forEach((proj, i) => {
    drawRoleLine(doc, proj.name, proj.link ?? '');
    doc.moveDown(GAP_AFTER_ROLE_LINE / SIZE_BODY);
    drawBullets(doc, proj.bullets.map((b) => b.text));
    if (i < projects.length - 1) doc.moveDown(GAP_BETWEEN_ENTRIES / SIZE_BODY);
  });
  doc.moveDown(GAP_AFTER_SECTION / SIZE_BODY);
}

function measureProjects(doc: PDFKit.PDFDocument, projects: TailoredProject[]): number {
  let h = measureSectionHeading(doc, 'Projects');
  projects.forEach((proj, i) => {
    h += measureRoleLine(doc, proj.name, proj.link ?? '');
    h += GAP_AFTER_ROLE_LINE;
    h += measureBullets(doc, proj.bullets.map((b) => b.text));
    if (i < projects.length - 1) h += GAP_BETWEEN_ENTRIES;
  });
  return h + GAP_AFTER_SECTION;
}

// ---------- role line (used by experience and projects) ----------

function drawRoleLine(doc: PDFKit.PDFDocument, left: string, right: string): void {
  const y = doc.y;
  doc.font(FONT_BOLD).fontSize(SIZE_ROLE).fillColor('#0a0a0a').text(left, MARGIN, y, { width: CONTENT_WIDTH * 0.7, continued: false });
  if (right) {
    doc.font(FONT_REGULAR).fontSize(SIZE_DATES).fillColor('#404040').text(right, MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });
  }
  doc.fillColor('black');
}

function measureRoleLine(doc: PDFKit.PDFDocument, left: string, right: string): number {
  doc.font(FONT_BOLD).fontSize(SIZE_ROLE);
  const leftH = doc.heightOfString(left, { width: CONTENT_WIDTH * 0.7 });
  doc.font(FONT_REGULAR).fontSize(SIZE_DATES);
  const rightH = right ? doc.heightOfString(right, { width: CONTENT_WIDTH }) : 0;
  return Math.max(leftH, rightH);
}

// ---------- bullets ----------

function drawBullets(doc: PDFKit.PDFDocument, bullets: string[]): void {
  doc.font(FONT_REGULAR).fontSize(SIZE_BODY).fillColor('#202020');
  for (const text of bullets) {
    doc.text(`•  ${text}`, MARGIN + BULLET_INDENT, doc.y, { width: CONTENT_WIDTH - BULLET_INDENT });
  }
  doc.fillColor('black');
}

function measureBullets(doc: PDFKit.PDFDocument, bullets: string[]): number {
  doc.font(FONT_REGULAR).fontSize(SIZE_BODY);
  return bullets.reduce(
    (sum, text) => sum + doc.heightOfString(`•  ${text}`, { width: CONTENT_WIDTH - BULLET_INDENT }),
    0,
  );
}

// ---------- skills ----------

function drawSkills(doc: PDFKit.PDFDocument, skills: string[]): void {
  drawSectionHeading(doc, 'Skills');
  doc.font(FONT_REGULAR).fontSize(SIZE_BODY).fillColor('#202020').text(skills.join(' · '), { width: CONTENT_WIDTH });
  doc.fillColor('black');
  doc.moveDown(GAP_AFTER_SECTION / SIZE_BODY);
}

function measureSkills(doc: PDFKit.PDFDocument, skills: string[]): number {
  let h = measureSectionHeading(doc, 'Skills');
  doc.font(FONT_REGULAR).fontSize(SIZE_BODY);
  h += doc.heightOfString(skills.join(' · '), { width: CONTENT_WIDTH });
  return h + GAP_AFTER_SECTION;
}

// ---------- education ----------

function drawEducation(doc: PDFKit.PDFDocument, edus: ResumeEducation[]): void {
  drawSectionHeading(doc, 'Education');
  edus.forEach((edu, i) => {
    drawRoleLine(doc, educationLeftLine(edu), edu.dates);
    if (i < edus.length - 1) doc.moveDown(GAP_BETWEEN_ENTRIES / SIZE_BODY);
  });
}

function measureEducation(doc: PDFKit.PDFDocument, edus: ResumeEducation[]): number {
  let h = measureSectionHeading(doc, 'Education');
  edus.forEach((edu, i) => {
    h += measureRoleLine(doc, educationLeftLine(edu), edu.dates);
    if (i < edus.length - 1) h += GAP_BETWEEN_ENTRIES;
  });
  return h;
}

function educationLeftLine(edu: ResumeEducation): string {
  const head = `${edu.degree}, ${edu.school}`;
  const details = edu.details?.trim();
  return details ? `${head}  ·  ${details}` : head;
}
