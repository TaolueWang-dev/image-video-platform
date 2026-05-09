import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(projectRoot, '.env');

loadDotEnvFile();

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined ? fallback : value.trim();
}

function loadDotEnvFile() {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const content = fs.readFileSync(envFilePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, '\n');
  }
}

function readAnyEnv(names, fallback = '') {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== '') {
      return value.trim();
    }
  }
  return fallback;
}

function parseInteger(name, fallback) {
  const raw = readEnv(name, String(fallback));
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new AppError(500, `Invalid integer env: ${name}`);
  }
  return value;
}

function parseBoolean(name, fallback = false) {
  const raw = readEnv(name, String(fallback));
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function parsePositiveInteger(name, fallback) {
  const value = parseInteger(name, fallback);
  if (value <= 0) {
    throw new AppError(500, `Invalid positive integer env: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(value, fallback) {
  const raw = value || fallback;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function parseUrlOverride(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    return {
      gateway: normalizeBaseUrl(parsed.origin, ''),
      path: `${parsed.pathname}${parsed.search}`,
    };
  } catch {
    return null;
  }
}

function firstCsvValue(value, fallback = '') {
  const raw = value || fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || '';
}

function csvValues(value, fallback = '') {
  const raw = value || fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function requiredIfConfigured(keyName, valueName, keyValue, valueValue) {
  if (keyValue && !valueValue) {
    throw new AppError(500, `${valueName} is required when ${keyName} is configured`);
  }
}

function wrapPemBody(body, width = 64) {
  return body.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\n') || body;
}

function normalizePem(value, type) {
  const raw = value?.trim();
  if (!raw) {
    return '';
  }

  if (raw.includes('-----BEGIN')) {
    return raw;
  }

  const begin = type === 'private' ? '-----BEGIN PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
  const end = type === 'private' ? '-----END PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
  return `${begin}\n${wrapPemBody(raw.replace(/\s+/g, ''))}\n${end}`;
}

export function loadConfig() {
  const openAiBaseUrl = normalizeBaseUrl(
    readAnyEnv(['OPENAI_IMAGE_BASE_URL', 'OPENAI_BASE_URL', 'base_url']),
    'https://api.openai.com/v1',
  );
  const seedDanceBaseUrl = normalizeBaseUrl(
    readEnv('SEEDDANCE_BASE_URL'),
    'https://ark.cn-beijing.volces.com',
  );

  const wechatPrivateKey = readEnv('WECHAT_PAY_PRIVATE_KEY');
  const wechatCertificate = readEnv('WECHAT_PAY_PLATFORM_CERT');
  const alipayPrivateKey = readEnv('ALIPAY_PRIVATE_KEY');
  const alipayPublicKey = readEnv('ALIPAY_PUBLIC_KEY');
  const junliaiPrivateKey = normalizePem(
    readAnyEnv(['JUNLIAI_PAY_PRIVATE_KEY', 'EPAY_PRIVATE_KEY']),
    'private',
  );
  const junliaiPublicKey = normalizePem(
    readAnyEnv([
    'JUNLIAI_PAY_PLATFORM_PUBLIC_KEY',
    'JUNLIAI_PAY_PUBLIC_KEY',
    'EPAY_PLATFORM_PUBLIC_KEY',
    'EPAY_PUBLIC_KEY',
  ]),
    'public',
  );
  const junliaiPid = readAnyEnv(['JUNLIAI_PAY_PID', 'EPAY_PID']);
  const junliaiCreateUrl = parseUrlOverride(readAnyEnv(['JUNLIAI_PAY_CREATE_URL', 'EPAY_CREATE_URL']));
  const junliaiQueryUrl = parseUrlOverride(readAnyEnv(['JUNLIAI_PAY_QUERY_URL', 'EPAY_QUERY_URL']));
  const junliaiSubmitUrl = parseUrlOverride(readAnyEnv(['JUNLIAI_PAY_SUBMIT_URL', 'EPAY_SUBMIT_URL']));

  requiredIfConfigured('WECHAT_PAY_PRIVATE_KEY', 'WECHAT_PAY_MCH_ID', wechatPrivateKey, readEnv('WECHAT_PAY_MCH_ID'));
  requiredIfConfigured('WECHAT_PAY_PRIVATE_KEY', 'WECHAT_PAY_APP_ID', wechatPrivateKey, readEnv('WECHAT_PAY_APP_ID'));
  requiredIfConfigured('ALIPAY_PRIVATE_KEY', 'ALIPAY_APP_ID', alipayPrivateKey, readEnv('ALIPAY_APP_ID'));
  requiredIfConfigured('JUNLIAI_PAY_PRIVATE_KEY', 'JUNLIAI_PAY_PID', junliaiPrivateKey, junliaiPid);
  requiredIfConfigured('JUNLIAI_PAY_PRIVATE_KEY', 'JUNLIAI_PAY_PUBLIC_KEY', junliaiPrivateKey, junliaiPublicKey);
  requiredIfConfigured('JUNLIAI_PAY_PID', 'JUNLIAI_PAY_PRIVATE_KEY', junliaiPid, junliaiPrivateKey);
  requiredIfConfigured('JUNLIAI_PAY_PID', 'JUNLIAI_PAY_PUBLIC_KEY', junliaiPid, junliaiPublicKey);

  const openAiDefaultModel = firstCsvValue(
    readAnyEnv(['OPENAI_IMAGE_MODEL', 'OPENAI_MODEL', 'MODEL_NAME', 'model_name']),
  );
  const configuredImageModels = csvValues(readAnyEnv(['OPENAI_IMAGE_MODELS']));
  const openAiImageModels = uniqueValues(
    configuredImageModels.length
      ? [openAiDefaultModel, ...configuredImageModels]
      : [openAiDefaultModel || 'gpt-image-2'],
  );

  return {
    env: readEnv('NODE_ENV', 'development'),
    host: readEnv('HOST', '0.0.0.0'),
    port: parseInteger('PORT', 3000),
    bodyLimitBytes: parseInteger('BODY_LIMIT_BYTES', 12 * 1024 * 1024),
    staticDir: 'public',
    dataDir: readEnv('DATA_DIR', 'data'),
    defaults: {
      currency: readEnv('DEFAULT_CURRENCY', 'CNY'),
      openingBalance: parseInteger('DEFAULT_ACCOUNT_BALANCE', 0),
    },
    rateLimit: {
      windowMs: parseInteger('RATE_LIMIT_WINDOW_MS', 60 * 1000),
      imageRequests: parseInteger('IMAGE_RATE_LIMIT_MAX', 12),
      videoRequests: parseInteger('VIDEO_RATE_LIMIT_MAX', 6),
    },
    auth: {
      sessionCookieName: readEnv('AUTH_SESSION_COOKIE_NAME', 'ivp_session'),
      sessionTtlMs: parsePositiveInteger('AUTH_SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1000),
      codeLength: parsePositiveInteger('AUTH_CODE_LENGTH', 6),
      codeTtlMs: parsePositiveInteger('AUTH_CODE_TTL_MS', 5 * 60 * 1000),
      emailRequestLimitWindowMs: parsePositiveInteger(
        'AUTH_EMAIL_REQUEST_LIMIT_WINDOW_MS',
        15 * 60 * 1000,
      ),
      emailRequestLimitPerEmail: parsePositiveInteger('AUTH_EMAIL_REQUEST_LIMIT_PER_EMAIL', 5),
      emailRequestLimitPerIp: parsePositiveInteger('AUTH_EMAIL_REQUEST_LIMIT_PER_IP', 10),
      registrationEnabled: parseBoolean('AUTH_REGISTRATION_ENABLED', true),
      passwordMinLength: parsePositiveInteger('AUTH_PASSWORD_MIN_LENGTH', 8),
      emailDeliveryMode: readEnv(
        'AUTH_EMAIL_DELIVERY_MODE',
        readEnv('NODE_ENV', 'development') === 'production' ? 'disabled' : 'log',
      ),
      exposeDevCode: parseBoolean(
        'AUTH_EXPOSE_DEV_CODE',
        readEnv('NODE_ENV', 'development') !== 'production',
      ),
      superAdmin: {
        email: readEnv('SUPER_ADMIN_EMAIL').toLowerCase(),
        role: readEnv('SUPER_ADMIN_ROLE', 'super_admin'),
      },
    },
    openai: {
      baseUrl: openAiBaseUrl,
      apiKey: readAnyEnv(['OPENAI_IMAGE_API_KEY', 'OPENAI_API_KEY', 'api_key']),
      defaultModel: openAiDefaultModel || openAiImageModels[0] || 'gpt-image-2',
      responsesModel: readEnv('OPENAI_RESPONSES_MODEL', 'gpt-5.5'),
      imageModels: openAiImageModels,
      imagesPath: readEnv('OPENAI_IMAGE_PATH', '/images/generations'),
      imageEditsPath: readEnv('OPENAI_IMAGE_EDITS_PATH', '/images/edits'),
      responsesPath: readEnv('OPENAI_RESPONSES_PATH', '/responses'),
      timeoutMs: parseInteger('OPENAI_TIMEOUT_MS', 120000),
    },
    seedDance: {
      baseUrl: seedDanceBaseUrl,
      apiKey: readEnv('SEEDDANCE_API_KEY') || readEnv('VOLCENGINE_API_KEY'),
      createPath: readEnv('SEEDDANCE_CREATE_PATH', '/api/v3/contents/generations/tasks'),
      queryPathTemplate: readEnv(
        'SEEDDANCE_QUERY_PATH_TEMPLATE',
        '/api/v3/contents/generations/tasks/{taskId}',
      ),
      timeoutMs: parseInteger('SEEDDANCE_TIMEOUT_MS', 180000),
      callbackBaseUrl: readEnv('PUBLIC_BASE_URL'),
      defaultModel: readEnv('SEEDDANCE_MODEL', 'doubao-seedance-2-0-250428'),
      defaultResolution: readEnv('SEEDDANCE_DEFAULT_RESOLUTION', '720p'),
      defaultRatio: readEnv('SEEDDANCE_DEFAULT_RATIO', '16:9'),
      defaultDuration: parseInteger('SEEDDANCE_DEFAULT_DURATION', 5),
      defaultGenerateAudio: parseBoolean('SEEDDANCE_DEFAULT_GENERATE_AUDIO', true),
    },
    payments: {
      wechat: {
        appId: readEnv('WECHAT_PAY_APP_ID'),
        mchId: readEnv('WECHAT_PAY_MCH_ID'),
        notifyUrl: readEnv('WECHAT_PAY_NOTIFY_URL'),
        privateKey: wechatPrivateKey,
        privateKeySerial: readEnv('WECHAT_PAY_CERT_SERIAL_NO'),
        platformCertificate: wechatCertificate,
        apiV3Key: readEnv('WECHAT_PAY_API_V3_KEY'),
      },
      alipay: {
        gateway: normalizeBaseUrl(
          readEnv('ALIPAY_GATEWAY'),
          'https://openapi.alipay.com/gateway.do',
        ),
        appId: readEnv('ALIPAY_APP_ID'),
        notifyUrl: readEnv('ALIPAY_NOTIFY_URL'),
        privateKey: alipayPrivateKey,
        publicKey: alipayPublicKey,
        charset: readEnv('ALIPAY_CHARSET', 'utf-8'),
        signType: readEnv('ALIPAY_SIGN_TYPE', 'RSA2'),
        version: readEnv('ALIPAY_VERSION', '1.0'),
      },
      junliai: {
        gateway:
          junliaiCreateUrl?.gateway ||
          junliaiQueryUrl?.gateway ||
          junliaiSubmitUrl?.gateway ||
          normalizeBaseUrl(
            readAnyEnv(['JUNLIAI_PAY_GATEWAY', 'EPAY_GATEWAY']),
            'https://pay.junliai.com',
          ),
        pid: junliaiPid,
        notifyUrl: readAnyEnv(['JUNLIAI_PAY_NOTIFY_URL', 'EPAY_NOTIFY_URL']),
        returnUrl: readAnyEnv(['JUNLIAI_PAY_RETURN_URL', 'EPAY_RETURN_URL']),
        privateKey: junliaiPrivateKey,
        publicKey: junliaiPublicKey,
        createPath:
          junliaiCreateUrl?.path ||
          readAnyEnv(['JUNLIAI_PAY_CREATE_PATH', 'EPAY_CREATE_PATH'], '/api/pay/create'),
        queryPath:
          junliaiQueryUrl?.path ||
          readAnyEnv(['JUNLIAI_PAY_QUERY_PATH', 'EPAY_QUERY_PATH'], '/api/pay/query'),
        submitPath:
          junliaiSubmitUrl?.path ||
          readAnyEnv(['JUNLIAI_PAY_SUBMIT_PATH', 'EPAY_SUBMIT_PATH'], '/api/pay/submit'),
        signType: readAnyEnv(['JUNLIAI_PAY_SIGN_TYPE', 'EPAY_SIGN_TYPE'], 'RSA'),
        method: readAnyEnv(['JUNLIAI_PAY_METHOD', 'EPAY_METHOD'], 'web'),
        device: readAnyEnv(['JUNLIAI_PAY_DEVICE', 'EPAY_DEVICE'], 'pc'),
      },
    },
  };
}
