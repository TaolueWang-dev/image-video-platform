import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError, badRequest } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export function resolveProjectPath(...segments) {
  if (segments.length === 1 && path.isAbsolute(segments[0])) {
    return segments[0];
  }
  return path.join(projectRoot, ...segments);
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureJsonFile(filePath, defaultValue) {
  try {
    await fs.access(filePath);
  } catch {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `${JSON.stringify(defaultValue, null, 2)}\n`, 'utf8');
  }
}

export async function readJsonFile(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

export async function writeJsonFile(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function randomId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export function randomDigits(length) {
  let value = '';
  while (value.length < length) {
    value += crypto.randomInt(0, 10).toString();
  }
  return value.slice(0, length);
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMilliseconds(timestamp, milliseconds) {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || storedHash.trim() === '') {
    return false;
  }

  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

export function json(value, statusCode = 200, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(value),
  };
}

export function text(value, statusCode = 200, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      ...headers,
    },
    body: value,
  };
}

export function getHeader(req, name) {
  return req.headers[name.toLowerCase()];
}

export function parseCookies(headerValue) {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') {
    return {};
  }

  return Object.fromEntries(
    headerValue
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) {
          return [part, ''];
        }
        const name = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        return [name, decodeURIComponent(value)];
      }),
  );
}

export function serializeCookie(name, value, options = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    attributes.push(`Max-Age=${options.maxAge}`);
  }
  if (options.path) {
    attributes.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    attributes.push('HttpOnly');
  }
  if (options.sameSite) {
    attributes.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}

export async function readRequestBody(req, limitBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw new AppError(413, 'Request body too large');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function readJsonBody(req, limitBytes) {
  const buffer = await readRequestBody(req, limitBytes);
  if (buffer.length === 0) {
    return {};
  }

  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw badRequest('Invalid JSON body', { cause: error.message });
  }
}

export function parseUrlEncoded(raw) {
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireObject(value, message) {
  if (!isObject(value)) {
    throw badRequest(message);
  }
}

export function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`Field "${fieldName}" must be a non-empty string`);
  }
  return value.trim();
}

export function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw badRequest(`Field "${fieldName}" must be a positive integer`);
  }
  return value;
}

export function buildNotifyUrl(baseUrl, pathName) {
  if (!baseUrl) {
    return '';
  }
  return `${baseUrl.replace(/\/$/, '')}${pathName}`;
}

export function canonicalJson(data) {
  return JSON.stringify(data);
}
