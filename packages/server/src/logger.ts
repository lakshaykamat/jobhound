// Structured, leveled logger. JSON to stdout/stderr in production; pretty
// output when stdout is a TTY. Configure via env:
//   LOG_LEVEL  = debug | info | warn | error   (default: info)
//   LOG_FORMAT = json | pretty                  (default: pretty if TTY, else json)
//   LOG_SERVICE = service name tag              (default: jobhound)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogFields {
  [key: string]: unknown;
  err?: unknown;
}

const ENV_LEVEL = parseLevel(process.env.LOG_LEVEL) ?? 'info';
const ENV_FORMAT = parseFormat(process.env.LOG_FORMAT);
const SERVICE = process.env.LOG_SERVICE || 'jobhound';
const PRETTY = ENV_FORMAT === 'pretty';
const COLOR = PRETTY && process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: ANSI.gray,
  info: ANSI.cyan,
  warn: ANSI.yellow,
  error: ANSI.red,
};
const paint = (s: string, color: string): string => (COLOR ? `${color}${s}${ANSI.reset}` : s);

function parseLevel(v: string | undefined): LogLevel | null {
  if (!v) return null;
  const l = v.toLowerCase();
  return (l in LEVEL_ORDER ? l : null) as LogLevel | null;
}

function parseFormat(v: string | undefined): 'json' | 'pretty' {
  if (v === 'json' || v === 'pretty') return v;
  return process.stdout.isTTY ? 'pretty' : 'json';
}

export class Logger {
  constructor(private readonly bound: LogFields = {}) {}

  child(fields: LogFields): Logger {
    return new Logger({ ...this.bound, ...fields });
  }

  debug(msg: string, fields?: LogFields): void {
    this.emit('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.emit('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.emit('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.emit('error', msg, fields);
  }

  private emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[ENV_LEVEL]) return;

    const merged: LogFields = { ...this.bound, ...(fields ?? {}) };
    const err = merged.err;
    if (err !== undefined) delete merged.err;

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      msg,
      ...merged,
    };
    if (err !== undefined) record.err = serializeError(err);

    const line = PRETTY ? formatPretty(level, msg, merged, err) : safeStringify(record);
    const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { name: err.name, message: err.message };
    if (err.stack) out.stack = err.stack;
    for (const k of Object.keys(err) as (keyof Error)[]) {
      if (k !== 'name' && k !== 'message' && k !== 'stack') {
        out[k as string] = (err as unknown as Record<string, unknown>)[k as string];
      }
    }
    return out;
  }
  return err;
}

function formatPretty(level: LogLevel, msg: string, fields: LogFields, err: unknown): string {
  const time = paint(new Date().toISOString().slice(11, 23), ANSI.dim);
  const tag = paint(LEVEL_TAGS[level], LEVEL_COLOR[level] + (COLOR ? ANSI.bold : ''));
  const parts = Object.entries(fields).map(
    ([k, v]) => `${paint(k, ANSI.dim)}=${paint(formatValue(v), ANSI.magenta)}`,
  );
  const tail = parts.length ? ' ' + parts.join(' ') : '';
  const message = level === 'error' ? paint(msg, ANSI.red) : msg;
  let line = `${time} ${tag} ${message}${tail}`;
  if (err !== undefined) {
    const s = err instanceof Error ? err.stack ?? err.message : String(err);
    line += '\n  ' + paint(s.split('\n').join('\n  '), ANSI.red);
  }
  return line;
}

const LEVEL_TAGS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

function formatValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return needsQuotes(v) ? JSON.stringify(v) : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return safeStringify(v);
}

function needsQuotes(s: string): boolean {
  return /[\s"=]/.test(s) || s.length === 0;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return JSON.stringify(String(v));
  }
}

export const logger = new Logger();
