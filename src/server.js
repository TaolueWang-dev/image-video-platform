import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { handleApiRequest } from './api-router.js';
import { loadConfig } from './config.js';
import { AppError, methodNotAllowed, notFound } from './errors.js';
import { createLogger } from './logger.js';
import { createRequestContext, getDurationMs, withRequestHeaders } from './request-context.js';
import { InMemoryRateLimiter } from './rate-limit.js';
import { DataStore } from './store.js';
import { json, resolveProjectPath, text } from './utils.js';

const config = loadConfig();
const store = new DataStore(config);
const logger = createLogger({ env: config.env });
const rateLimiter = new InMemoryRateLimiter();
const publicDir = resolveProjectPath(config.staticDir);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function sendResponse(res, response) {
  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
}

function getStaticPath(urlPathname) {
  const normalized = path.normalize(decodeURIComponent(urlPathname));
  const relative = normalized === '/' ? '/index.html' : normalized;
  const target = path.join(publicDir, relative);
  if (!target.startsWith(publicDir)) {
    throw notFound('Static file not found');
  }
  return target;
}

async function resolveStaticTarget(pathname) {
  const baseTarget = getStaticPath(pathname);
  const candidates = [baseTarget];

  if (!path.extname(baseTarget)) {
    candidates.push(`${baseTarget}.html`);
    candidates.push(path.join(baseTarget, 'index.html'));
  }

  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) {
      return candidate;
    }
  }

  throw notFound('Static file not found');
}

async function serveStatic(req, res, pathname) {
  const target = await resolveStaticTarget(pathname);
  const ext = path.extname(target).toLowerCase();
  const contentType = mimeTypes.get(ext) || 'application/octet-stream';
  const content = await fs.readFile(target);
  sendResponse(res, {
    statusCode: 200,
    headers: {
      'content-type': contentType,
      'content-length': String(content.length),
    },
    body: req.method === 'HEAD' ? '' : content,
  });
}

async function requestListener(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const context = createRequestContext(req, url);

  logger.info('request.started', {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    ip: context.ip,
  });

  try {
    if ((req.method || 'GET') === 'OPTIONS') {
      sendResponse(
        res,
        withRequestHeaders(
          text('', 204, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': 'Content-Type,Authorization',
          }),
          context.requestId,
        ),
      );
      logger.info('request.completed', {
        requestId: context.requestId,
        method: context.method,
        path: context.path,
        ip: context.ip,
        statusCode: 204,
        durationMs: getDurationMs(context),
      });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const response = await handleApiRequest(
        { config, store, logger, rateLimiter },
        req,
        url,
        context,
      );
      sendResponse(
        res,
        withRequestHeaders(
          {
            ...response,
            headers: {
              ...response.headers,
              'access-control-allow-origin': '*',
            },
          },
          context.requestId,
        ),
      );
      logger.info('request.completed', {
        requestId: context.requestId,
        method: context.method,
        path: context.path,
        ip: context.ip,
        statusCode: response.statusCode,
        durationMs: getDurationMs(context),
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw methodNotAllowed();
    }

    await serveStatic(req, res, url.pathname);
    logger.info('request.completed', {
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      ip: context.ip,
      statusCode: 200,
      durationMs: getDurationMs(context),
    });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof AppError ? error.message : 'Internal server error';
    const details = error instanceof AppError ? error.details : { cause: error.message };
    const extraHeaders = {};
    if (statusCode === 429 && details?.retryAfterMs) {
      extraHeaders['retry-after'] = String(Math.ceil(details.retryAfterMs / 1000));
    }
    logger.error('request.failed', {
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      ip: context.ip,
      statusCode,
      durationMs: getDurationMs(context),
      message,
      details,
    });
    sendResponse(
      res,
      withRequestHeaders(
        json(
          {
            error: {
              message,
              details,
            },
          },
          statusCode,
          extraHeaders,
        ),
        context.requestId,
      ),
    );
  }
}

async function bootstrap() {
  await store.init();
  const server = http.createServer(requestListener);
  server.on('error', (error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `Server listening on http://${config.host}:${config.port}\n`,
    );
  });
}

bootstrap().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
