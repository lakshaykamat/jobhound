import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { promises as fs } from 'fs';
import { mkdirSync } from 'fs';
import path from 'path';
import { AppConfig, buildConfig, ConfigFile, configPathFor, saveConfig, tryLoadConfig } from '../config';
import { DEFAULT_HTTP_PORT, RESUME_PDF_MAX_BYTES, SHUTDOWN_SIGNALS } from '../constants';
import { JobsStore } from '../adapters/jobs-store';
import { ResumeStore } from '../adapters/resume-store';
import { ResumeParseError, parseResumePdf } from '../adapters/resume-parser';
import { deriveProfileFromResume } from '../core/profile-from-resume';
import { TailorValidationError, tailorResume } from '../core/tailor';
import { EventBus, ServerEvent } from '../core/event-bus';
import { ObservableTracker } from '../core/observable-tracker';
import { ServerController } from '../core/server-state';
import { logger } from '../logger';
import { BaseResume } from '../types';
import { validateStartup } from './startup';

const DEFAULT_DATA_DIR = './.data';
const WEB_DIR = path.resolve(__dirname, '..', '..', 'web');

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR;
  mkdirSync(dataDir, { recursive: true });
  const configPath = configPathFor(dataDir);

  logger.info('server starting', {
    mode: once ? 'once' : 'http',
    config_path: configPath,
    data_dir: dataDir,
    node: process.version,
    pid: process.pid,
    log_level: process.env.LOG_LEVEL ?? 'info',
    log_format: process.env.LOG_FORMAT ?? (process.stdout.isTTY ? 'pretty' : 'json'),
  });

  const { config } = validateStartup({ configPath, dataDir });
  const store = new JobsStore(dataDir);
  const resumeStore = new ResumeStore(dataDir);
  const bus = new EventBus();
  const tracker = new ObservableTracker(dataDir, bus);

  const controller = new ServerController({ configPath, store, tracker, bus });

  if (once) {
    if (!config) {
      logger.error('--once requires a valid config.json; run the server in HTTP mode and complete Setup first');
      process.exit(1);
    }
    const result = await controller.runOnce();
    if (!result.ok) {
      logger.error('--once failed to start', { reason: result.reason });
      process.exit(1);
    }
    await controller.drain();
    logger.info('server exiting after --once run');
    return;
  }

  const port = process.env.PORT
    ? Number(process.env.PORT)
    : config?.server.http_port ?? DEFAULT_HTTP_PORT;
  const httpServer = createServer((req, res) => {
    handleRequest(req, res, controller, bus, dataDir, store, resumeStore, configPath).catch((err) => {
      logger.error('request handler crashed', { err, url: req.url });
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      }
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  logger.info('http server listening (start paused — open the UI to begin)', {
    port,
    url: `http://localhost:${port}`,
  });

  installShutdownHandlers(async () => {
    logger.info('shutdown signal received; draining server');
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await controller.drain();
    logger.info('server shut down cleanly');
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  controller: ServerController,
  bus: EventBus,
  dataDir: string,
  store: JobsStore,
  resumeStore: ResumeStore,
  configPath: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;
  const method = req.method ?? 'GET';

  // CORS-free local UI; allow same-origin only.

  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return serveStatic(res, path.join(WEB_DIR, 'index.html'), 'text/html; charset=utf-8');
  }
  if (method === 'GET' && !pathname.startsWith('/api/')) {
    const served = await tryServeWebAsset(res, pathname);
    if (served) return;
  }

  if (method === 'GET' && pathname === '/api/state') {
    const snap = controller.snapshot();
    const usage = await controller.monthlyUsage();
    return json(res, 200, { ...snap, month_usage: usage });
  }
  if (method === 'GET' && pathname === '/api/setup/status') {
    const cfg = controller.loadConfigSafe();
    const resume = await resumeStore.read();
    return json(res, 200, { configured: cfg !== null, has_base_resume: resume !== null });
  }
  if (method === 'GET' && pathname === '/api/config') {
    const cfg = controller.loadConfigSafe();
    if (!cfg) return json(res, 404, { error: 'config not set', needs_setup: true });
    return json(res, 200, cfg);
  }
  if (method === 'PUT' && pathname === '/api/config') {
    const body = await readJsonBody<AppConfig>(req);
    if (!body) return json(res, 400, { error: 'invalid JSON body' });
    try {
      saveConfig(configPath, body);
      logger.info('config saved via API', { config_path: configPath });
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }
  if (method === 'POST' && pathname === '/api/setup') {
    return handleSetup(req, res, resumeStore, configPath);
  }

  if (method === 'POST' && pathname === '/api/start') {
    const r = controller.start();
    return json(res, r.ok ? 200 : 409, r);
  }
  if (method === 'POST' && pathname === '/api/stop') {
    const r = controller.stop();
    return json(res, r.ok ? 200 : 409, r);
  }
  if (method === 'POST' && pathname === '/api/run-once') {
    const r = await controller.runOnce();
    return json(res, r.ok ? 202 : 409, r);
  }

  if (method === 'GET' && pathname === '/api/cycles') {
    const limit = clampLimit(url.searchParams.get('limit'), 50, 500);
    const rows = await readTailJsonl(path.join(dataDir, 'cycles.jsonl'), limit);
    return json(res, 200, { cycles: rows });
  }
  if (method === 'GET' && pathname === '/api/jobs') {
    const limit = clampLimit(url.searchParams.get('limit'), 200, 2000);
    const rows = await readTailJsonl(path.join(dataDir, 'jobs.jsonl'), limit);
    return json(res, 200, { jobs: rows });
  }
  if (method === 'GET' && pathname === '/api/jobs-store') {
    const records = await store.readAll();
    return json(res, 200, { jobs: records });
  }

  if (method === 'GET' && pathname === '/api/events') {
    return streamEvents(res, controller, bus);
  }

  if (method === 'GET' && pathname === '/api/resume') {
    const resume = await resumeStore.read();
    if (!resume) return json(res, 404, { error: 'no base resume uploaded yet' });
    return json(res, 200, resume);
  }
  if (method === 'PUT' && pathname === '/api/resume') {
    const body = await readJsonBody<BaseResume>(req);
    if (!body) return json(res, 400, { error: 'invalid JSON body' });
    await resumeStore.write(body);
    return json(res, 200, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/resume/upload') {
    return handleResumeUpload(req, res, controller, resumeStore, url);
  }
  if (method === 'POST' && pathname === '/api/tailor') {
    return handleTailor(req, res, controller, resumeStore);
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', path: pathname }));
}

async function handleTailor(
  req: IncomingMessage,
  res: ServerResponse,
  controller: ServerController,
  resumeStore: ResumeStore,
): Promise<void> {
  const body = await readJsonBody<{ jd?: unknown }>(req);
  const jd = typeof body?.jd === 'string' ? body.jd : '';
  if (jd.trim().length === 0) return json(res, 400, { error: 'jd is required' });

  const base = await resumeStore.read();
  if (!base) return json(res, 409, { error: 'no base resume uploaded yet', needs_base_resume: true });

  const cfg = controller.loadConfigSafe();
  if (!cfg) return json(res, 409, { error: 'config not set', needs_setup: true });

  try {
    const result = await tailorResume({
      base,
      jd,
      apiKey: cfg.secrets.openai_key,
      model: cfg.openai.model,
      log: logger.child({ feature: 'tailor', mode: 'patch' }),
    });
    await resumeStore.write(result.updated);
    return json(res, 200, result);
  } catch (err) {
    if (err instanceof TailorValidationError) {
      return json(res, 502, { error: err.message, violations: err.violations });
    }
    throw err;
  }
}

interface SetupRequest {
  cycle?: { queries?: string[] };
  serpapi?: { country?: string; language?: string };
  openai?: { model?: string };
  secrets?: { serpapi_key?: string; openai_key?: string };
  profile?: { seniority?: string | null };
}

async function handleSetup(
  req: IncomingMessage,
  res: ServerResponse,
  resumeStore: ResumeStore,
  configPath: string,
): Promise<void> {
  const body = await readJsonBody<SetupRequest>(req);
  if (!body) return json(res, 400, { error: 'invalid JSON body' });

  const resume = await resumeStore.read();
  if (!resume) {
    return json(res, 409, { error: 'upload a resume first — POST /api/resume/upload', needs_resume: true });
  }

  const derived = deriveProfileFromResume(resume);
  const seniority = (body.profile?.seniority ?? '').toString().trim();

  const raw: ConfigFile = {
    cycle: { queries: body.cycle?.queries ?? [] },
    serpapi: {
      country: (body.serpapi?.country ?? '').trim().toLowerCase(),
      language: (body.serpapi?.language ?? '').trim().toLowerCase(),
    },
    openai: { model: (body.openai?.model ?? '').trim() },
    profile: {
      skills: derived.skills,
      role_titles: derived.role_titles,
      years_experience: derived.years_experience,
      seniority,
    },
    secrets: {
      serpapi_key: (body.secrets?.serpapi_key ?? '').trim(),
      openai_key: (body.secrets?.openai_key ?? '').trim(),
    },
  };

  try {
    const cfgPayload = buildConfig(raw);
    saveConfig(configPath, cfgPayload);
    logger.info('config saved via /api/setup', {
      config_path: configPath,
      derived_skills: derived.skills.length,
      derived_role_titles: derived.role_titles.length,
      derived_years_experience: derived.years_experience,
    });
    return json(res, 200, { ok: true, derived });
  } catch (err) {
    return json(res, 400, { error: (err as Error).message });
  }
}

async function handleResumeUpload(
  req: IncomingMessage,
  res: ServerResponse,
  controller: ServerController,
  resumeStore: ResumeStore,
  url: URL,
): Promise<void> {
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/pdf')) {
    return json(res, 415, { error: 'expected Content-Type: application/pdf' });
  }
  const bytes = await readPdfBody(req);
  if (!bytes) return json(res, 413, { error: `PDF exceeds ${RESUME_PDF_MAX_BYTES} bytes` });

  const fileName = (url.searchParams.get('filename') ?? 'resume.pdf').trim() || 'resume.pdf';
  const cfg = controller.loadConfigSafe();
  const queryKey = url.searchParams.get('openai_key')?.trim() ?? '';
  const queryModel = url.searchParams.get('model')?.trim() || undefined;
  const apiKey = cfg?.secrets.openai_key || queryKey;
  if (!apiKey) {
    return json(res, 409, { error: 'openai_key required (no config and no openai_key query param)', needs_setup: true });
  }
  const model = cfg?.openai.model || queryModel;

  try {
    const { resume, tokens } = await parseResumePdf(
      bytes,
      fileName,
      apiKey,
      model,
      logger.child({ feature: 'resume-upload', file: fileName }),
    );
    await resumeStore.write(resume);
    return json(res, 200, { resume, tokens });
  } catch (err) {
    if (err instanceof ResumeParseError) {
      return json(res, 400, { error: err.message, reason: err.reason });
    }
    throw err;
  }
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > 2 * 1024 * 1024) return null;
    chunks.push(buf);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    return null;
  }
}

async function readPdfBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > RESUME_PDF_MAX_BYTES) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

const STATIC_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function tryServeWebAsset(res: ServerResponse, pathname: string): Promise<boolean> {
  const rel = pathname.replace(/^\/+/, '');
  if (!rel) return false;
  const target = path.resolve(WEB_DIR, rel);
  if (target !== WEB_DIR && !target.startsWith(WEB_DIR + path.sep)) return false;
  const ext = path.extname(target).toLowerCase();
  const ct = STATIC_CONTENT_TYPES[ext];
  if (!ct) return false;
  try {
    const body = await fs.readFile(target);
    res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-cache' });
    res.end(body);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

async function serveStatic(res: ServerResponse, file: string, contentType: string): Promise<void> {
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`missing ${path.basename(file)}`);
      return;
    }
    throw err;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function streamEvents(res: ServerResponse, controller: ServerController, bus: EventBus): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const write = (event: ServerEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
  };

  // Push initial state so the page paints immediately on connect.
  write({ type: 'state', payload: controller.snapshot() });

  const unsubscribe = bus.subscribe(write);
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function readTailJsonl<T = unknown>(file: string, limit: number): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const tail = lines.slice(-limit).reverse();
    const out: T[] = [];
    for (const line of tail) {
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        // skip malformed line
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function clampLimit(raw: string | null, fallback: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function installShutdownHandlers(onShutdown: () => Promise<void>): void {
  let firing = false;
  const fire = async (sig: NodeJS.Signals) => {
    if (firing) return;
    firing = true;
    logger.info('signal', { signal: sig });
    try {
      await onShutdown();
    } finally {
      process.exit(0);
    }
  };
  for (const sig of SHUTDOWN_SIGNALS) {
    process.on(sig, () => {
      fire(sig).catch((err) => {
        logger.error('shutdown failed', { err });
        process.exit(1);
      });
    });
  }
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException; exiting', { err });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection; exiting', { err: reason });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('fatal error in server main', { err });
  process.exit(1);
});
