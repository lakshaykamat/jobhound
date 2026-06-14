import { PDFParse, PasswordException, InvalidPDFException } from 'pdf-parse';
import { chat } from './llm';
import { Logger, logger as rootLogger } from '../logger';
import { PARSE_RESUME_MAX_TOKENS } from '../constants';
import {
  PARSE_RESUME_SCHEMA,
  PARSE_RESUME_SYSTEM_PROMPT,
  buildParseResumePrompt,
} from '../prompts';
import { sanitizeResume, sanitizeText } from '../core/sanitize-text';
import { BaseResume } from '../types';

export class ResumeParseError extends Error {
  constructor(public reason: 'empty' | 'password-protected' | 'invalid-pdf' | 'no-text', message: string) {
    super(message);
    this.name = 'ResumeParseError';
  }
}

export interface ParsedResume {
  resume: BaseResume;
  tokens: number;
}

export async function parseResumePdf(
  pdfBytes: Buffer,
  sourcePdfName: string,
  apiKey: string,
  model: string | undefined,
  log: Logger = rootLogger,
): Promise<ParsedResume> {
  const rawText = await extractText(pdfBytes);
  log.info('resume pdf text extracted', { chars: rawText.length, name: sourcePdfName });
  log.debug('resume raw text', { content: rawText });

  const userPrompt = buildParseResumePrompt(rawText);
  log.debug('parse resume system prompt', { content: PARSE_RESUME_SYSTEM_PROMPT });
  log.debug('parse resume user prompt', { content: userPrompt });

  const result = await chat(
    [
      { role: 'system', content: PARSE_RESUME_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
    { model, maxTokens: PARSE_RESUME_MAX_TOKENS, schema: PARSE_RESUME_SCHEMA, log },
  );
  log.debug('parse resume llm response', {
    tokens: result.tokens,
    response_chars: result.text.length,
    response: result.text,
  });

  const parsed = JSON.parse(result.text) as Omit<BaseResume, 'source_pdf_name' | 'parsed_at'>;
  const resume: BaseResume = sanitizeResume({
    ...parsed,
    source_pdf_name: sourcePdfName,
    parsed_at: formatToday(new Date()),
  });

  log.info('resume parsed', {
    tokens: result.tokens,
    experience: resume.experience.length,
    projects: resume.projects.length,
    skills: resume.skills.length,
    education: resume.education.length,
  });
  log.debug('resume parsed full', { resume });
  return { resume, tokens: result.tokens };
}

async function extractText(pdfBytes: Buffer): Promise<string> {
  if (pdfBytes.length === 0) {
    throw new ResumeParseError('empty', 'uploaded PDF is empty');
  }
  try {
    const parser = new PDFParse({ data: new Uint8Array(pdfBytes) });
    try {
      const result = await parser.getText();
      const text = sanitizeText(result.text);
      if (text.length === 0) {
        throw new ResumeParseError('no-text', 'PDF contained no extractable text (likely scanned images)');
      }
      return text;
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    if (err instanceof ResumeParseError) throw err;
    if (err instanceof PasswordException) {
      throw new ResumeParseError('password-protected', 'PDF is password-protected');
    }
    if (err instanceof InvalidPDFException) {
      throw new ResumeParseError('invalid-pdf', 'file is not a valid PDF');
    }
    throw err;
  }
}

function formatToday(now: Date): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
