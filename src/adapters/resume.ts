import { readFileSync } from 'fs';
import { extname } from 'path';
import { PDFParse } from 'pdf-parse';
import { DEFAULT_RESUME_MAX_CHARS } from '../constants';

export async function readResume(path: string, maxChars = DEFAULT_RESUME_MAX_CHARS): Promise<string> {
  const ext = extname(path).toLowerCase();
  const raw = await extractRaw(path, ext);
  const cleaned = normalize(raw);

  if (!cleaned) throw new Error(`resume at ${path} is empty after parsing`);
  if (cleaned.length > maxChars) {
    throw new Error(
      `resume is ${cleaned.length} chars; limit is ${maxChars}. Trim it before extracting.`,
    );
  }
  return cleaned;
}

async function extractRaw(path: string, ext: string): Promise<string> {
  if (ext === '.pdf') return readPdf(path);
  if (ext === '.txt') return readFileSync(path, 'utf-8');
  throw new Error(`unsupported resume extension "${ext}"; use .pdf or .txt`);
}

async function readPdf(path: string): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(readFileSync(path)) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function normalize(text: string): string {
  return text
    .replace(/\f/g, '\n')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
