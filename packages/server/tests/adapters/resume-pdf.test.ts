import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { ONE_PAGE_MAX_HEIGHT, measureResume, renderResume } from '../../src/adapters/resume-pdf';
import { makeTailoredResume } from '../_helpers/factories';

describe('renderResume', () => {
  it('returns a valid PDF buffer', async () => {
    const buf = await renderResume(makeTailoredResume());
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders even with empty sections', async () => {
    const buf = await renderResume(
      makeTailoredResume({ summary: '', experience: [], projects: [], skills: [], education: [] }),
    );
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('formats resume links and omits experience locations from visible text', async () => {
    const buf = await renderResume(
      makeTailoredResume({
        contact: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+91 90000 00000',
          location: 'Bengaluru, India',
          links: [
            { label: 'https://linkedin.com/in/jane', url: 'https://linkedin.com/in/jane' },
            { label: 'https://github.com/jane', url: 'https://github.com/jane' },
          ],
        },
        experience: [
          {
            company: 'Acme',
            title: 'Senior Backend Engineer',
            dates: 'Jan 2023 - Present',
            location: 'Remote',
            bullets: [{ text: 'Led microservices migration on Kubernetes.', jd_relevance: 0.9 }],
          },
        ],
        projects: [
          {
            name: 'OpenRails',
            link: 'https://github.com/jane/openrails',
            bullets: [{ text: 'CLI tool for railway timetables.', jd_relevance: 0.6 }],
          },
        ],
      }),
    );

    const text = await extractPdfText(buf);
    expect(text).toContain('jane@example.com');
    expect(text).toContain('LinkedIn');
    expect(text).toContain('GitHub');
    expect(text).toContain('Project link');
    expect(text).not.toContain('linkedin.com/in/jane');
    expect(text).not.toContain('github.com/jane/openrails');
    expect(text).not.toContain('Remote');
  });
});

describe('measureResume', () => {
  it('returns a positive height for a normal resume', () => {
    const h = measureResume(makeTailoredResume());
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(ONE_PAGE_MAX_HEIGHT);
  });

  it('grows when more bullets are added', () => {
    const small = measureResume(makeTailoredResume());
    const big = measureResume(
      makeTailoredResume({
        experience: [
          {
            company: 'Acme',
            title: 'Senior Backend Engineer',
            dates: 'Jan 2023 – Present',
            location: 'Remote',
            bullets: Array.from({ length: 10 }, (_, i) => ({
              text: `Long bullet number ${i} describing significant production impact at scale.`,
              jd_relevance: 0.5,
            })),
          },
        ],
      }),
    );
    expect(big).toBeGreaterThan(small);
  });
});

async function extractPdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
