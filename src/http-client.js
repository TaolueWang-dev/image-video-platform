import { upstreamError } from './errors.js';

export async function requestJson({
  method,
  baseUrl,
  path,
  headers = {},
  body,
  timeoutMs,
  logger,
  requestId,
  operation = 'upstream.request',
}) {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logger?.info(`${operation}.started`, {
      requestId,
      method,
      url,
    });

    const normalizedHeaders = { ...headers };
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;
    if (isFormData) {
      delete normalizedHeaders['content-type'];
      delete normalizedHeaders['Content-Type'];
    }

    const response = await fetch(url, {
      method,
      headers: normalizedHeaders,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed = raw;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }

    if (!response.ok) {
      throw upstreamError('Upstream request failed', {
        url,
        status: response.status,
        body: parsed,
      });
    }

    logger?.info(`${operation}.completed`, {
      requestId,
      method,
      url,
      status: response.status,
    });

    return {
      status: response.status,
      headers: response.headers,
      data: parsed,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      logger?.warn(`${operation}.timeout`, {
        requestId,
        method,
        url,
        timeoutMs,
      });
      throw upstreamError('Upstream request timed out', { url, timeoutMs }, 504);
    }
    logger?.error(`${operation}.failed`, {
      requestId,
      method,
      url,
      message: error.message,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
