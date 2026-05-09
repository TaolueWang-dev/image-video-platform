import { randomId } from './utils.js';

function firstForwardedIp(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || '';
}

export function getClientIp(req) {
  return (
    firstForwardedIp(req.headers['x-forwarded-for']) ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export function createRequestContext(req, url) {
  const startedAt = Date.now();
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
    randomId('req');

  return {
    requestId,
    method: req.method || 'GET',
    path: url.pathname,
    ip: getClientIp(req),
    startedAt,
  };
}

export function withRequestHeaders(response, requestId) {
  return {
    ...response,
    headers: {
      ...response.headers,
      'x-request-id': requestId,
    },
  };
}

export function getDurationMs(context) {
  return Date.now() - context.startedAt;
}
