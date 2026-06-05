import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { AppConfig } from '../config';
import { SHUTDOWN_SIGNALS } from '../constants';
import { JobsSheet } from '../adapters/sheets';
import { Secrets } from '../core/process-cycle';
import { EventBus, ServerEvent } from '../core/event-bus';
import { ObservableTracker } from '../core/observable-tracker';
import { ServerController } from '../core/server-state';
import { logger } from '../logger';
import { StartupValidationError, validateStartup } from './startup';

const DEFAULT_DATA_DIR = './.data';
const USAGE = 'usage: server <config.json path> [--once]';
const WEB_DIR = path.resolve(__dirname, '..', '..', 'web');

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const configPath = args.find((a) => !a.startsWith('--'));
  if (!configPath) {
    logger.error('config path is required; pass it as a positional argument', { usage: USAGE });
    process.exit(1);
  }
  const dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR;

  logger.info('server starting', {
    mode: once ? 'once' : 'http',
    config_path: configPath,
    data_dir: dataDir,
    node: process.version,
    pid: process.pid,
    log_level: process.env.LOG_LEVEL ?? 'info',
    log_format: process.env.LOG_FORMAT ?? (process.stdout.isTTY ? 'pretty' : 'json'),
  });

  const { env, config } = validateStartup({ configPath, dataDir });
  const sheet = new JobsSheet(env.APPS_SCRIPT_URL, env.APPS_SCRIPT_TOKEN);
  const bus = new EventBus();
  const tracker = new ObservableTracker(dataDir, bus);
  const secrets: Secrets = { serpapi: env.SERPAPI_KEY, openai: env.OPENAI_KEY };

  const controller = new ServerController({ configPath, sheet, tracker, secrets, bus });

  if (once) {
    const result = await controller.runOnce();
    if (!result.ok) {
      logger.error('--once failed to start', { reason: result.reason });
      process.exit(1);
    }
    await controller.drain();
    logger.info('server exiting after --once run');
    return;
  }

  const port = process.env.PORT ? Number(process.env.PORT) : config.server.http_port;
  const httpServer = createServer((req, res) => {
    handleRequest(req, res, controller, bus, dataDir).catch((err) => {
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
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;
  const method = req.method ?? 'GET';

  // CORS-free local UI; allow same-origin only.

  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return serveStatic(res, path.join(WEB_DIR, 'index.html'), 'text/html; charset=utf-8');
  }
  if (method === 'GET' && pathname === '/app.js') {
    return serveStatic(res, path.join(WEB_DIR, 'app.js'), 'application/javascript; charset=utf-8');
  }

  if (method === 'GET' && pathname === '/api/state') {
    const snap = controller.snapshot();
    const usage = await controller.monthlyUsage();
    return json(res, 200, { ...snap, month_usage: usage });
  }
  if (method === 'GET' && pathname === '/api/config') {
    try {
      const cfg: AppConfig = controller.loadConfigOrThrow();
      return json(res, 200, cfg);
    } catch (err) {
      return json(res, 500, { error: (err as Error).message });
    }
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

  if (method === 'GET' && pathname === '/api/events') {
    return streamEvents(res, controller, bus);
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', path: pathname }));
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
  if (err instanceof StartupValidationError) {
    logger.error('startup aborted; fix the issues above and retry', { issue_count: err.errors.length });
  } else {
    logger.error('fatal error in server main', { err });
  }
  process.exit(1);
});
