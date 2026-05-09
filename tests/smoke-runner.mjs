import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.resolve(
  process.env.SMOKE_DATA_DIR || (await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-smoke-'))),
);
const writeMode = ['1', 'true', 'yes'].includes(String(process.env.SMOKE_WRITE || '0').toLowerCase());
const smokeAuthEmail = process.env.SMOKE_AUTH_EMAIL || 'smoke-user@example.com';
const smokeAuthSubjectType = process.env.SMOKE_AUTH_SUBJECT_TYPE || 'user';
const smokeOperatorEmail = process.env.SMOKE_OPERATOR_EMAIL || 'smoke-operator@example.com';
const smokeSuperAdminEmail = process.env.SMOKE_SUPER_ADMIN_EMAIL || 'smoke-admin@example.com';

process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.AUTH_EXPOSE_DEV_CODE = process.env.AUTH_EXPOSE_DEV_CODE || 'true';
process.env.AUTH_EMAIL_DELIVERY_MODE = process.env.AUTH_EMAIL_DELIVERY_MODE || 'log';
// Keep local smoke deterministic even when .env contains live payment credentials.
process.env.JUNLIAI_PAY_PID = '';
process.env.JUNLIAI_PAY_PRIVATE_KEY = '';
process.env.JUNLIAI_PAY_PLATFORM_PUBLIC_KEY = '';
process.env.JUNLIAI_PAY_PUBLIC_KEY = '';
process.env.EPAY_PID = '';
process.env.EPAY_PRIVATE_KEY = '';
process.env.EPAY_PLATFORM_PUBLIC_KEY = '';
process.env.EPAY_PUBLIC_KEY = '';

const [{ handleApiRequest }, { loadConfig }, { DataStore }, { InMemoryRateLimiter }, { createRequestContext }] =
  await Promise.all([
    import('../src/api-router.js'),
    import('../src/config.js'),
    import('../src/store.js'),
    import('../src/rate-limit.js'),
    import('../src/request-context.js'),
  ]);
const { AppError } = await import('../src/errors.js');

const config = loadConfig();
const store = new DataStore(config);
const deps = {
  config,
  store,
  rateLimiter: new InMemoryRateLimiter(),
  logger: {
    debug() {},
    info() {},
    warn() {},
    error() {},
  },
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContains(haystack, needle, label) {
  assert(haystack.includes(needle), `missing expected content for ${label}: ${needle}`);
}

function createMockRequest(method, headers, bodyText) {
  return {
    method,
    headers,
    socket: {
      remoteAddress: '127.0.0.1',
    },
    async *[Symbol.asyncIterator]() {
      if (bodyText) {
        yield Buffer.from(bodyText, 'utf8');
      }
    },
  };
}

function applySetCookie(cookieJar, setCookieHeader) {
  if (!setCookieHeader) {
    return cookieJar;
  }

  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const pair = String(raw).split(';')[0] || '';
  return pair || cookieJar;
}

async function apiRequest(method, requestPath, { body, cookieJar } = {}) {
  const url = new URL(`http://localhost${requestPath}`);
  const headers = {};
  if (cookieJar) {
    headers.cookie = cookieJar;
  }
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const req = createMockRequest(method, headers, bodyText);
  const context = createRequestContext(req, url);
  let response;
  try {
    response = await handleApiRequest(deps, req, url, context);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }
    response = {
      statusCode: error.statusCode,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        error: {
          message: error.message,
          details: error.details,
        },
      }),
    };
  }
  const nextCookieJar = applySetCookie(cookieJar, response.headers['set-cookie']);
  const isJson = String(response.headers['content-type'] || '').includes('application/json');

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    bodyText: response.body,
    json: isJson ? JSON.parse(response.body) : null,
    cookieJar: nextCookieJar,
  };
}

async function seedUser(email, subjectType, seededId = 'user_smoke') {
  if (subjectType !== 'user') {
    return;
  }

  const filePath = path.join(dataDir, 'users.json');
  const now = new Date().toISOString();
  let users = [];

  try {
    users = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {}

  const index = users.findIndex((item) => item.email === email);
  const nextUser = {
    id: index >= 0 ? users[index].id : seededId,
    email,
    status: 'active',
    createdAt: index >= 0 ? users[index].createdAt || now : now,
    updatedAt: now,
    lastLoginAt: index >= 0 ? users[index].lastLoginAt || '' : '',
  };

  if (index >= 0) {
    users[index] = { ...users[index], ...nextUser };
  } else {
    users.push(nextUser);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

async function seedUserPassword(email, passwordHash) {
  const filePath = path.join(dataDir, 'users.json');
  let users = [];

  try {
    users = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {}

  const index = users.findIndex((item) => item.email === email);
  if (index >= 0) {
    users[index] = { ...users[index], passwordHash };
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

async function seedAdmins() {
  const filePath = path.join(dataDir, 'admin-users.json');
  const now = new Date().toISOString();
  let admins = [];

  try {
    admins = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {}

  const ensureAdmin = (email, role, id) => {
    const index = admins.findIndex((item) => item.email === email);
    const next = {
      id: index >= 0 ? admins[index].id : id,
      email,
      role,
      status: 'active',
      createdAt: index >= 0 ? admins[index].createdAt || now : now,
      updatedAt: now,
      lastLoginAt: index >= 0 ? admins[index].lastLoginAt || '' : '',
    };

    if (index >= 0) {
      admins[index] = { ...admins[index], ...next };
    } else {
      admins.push(next);
    }
  };

  ensureAdmin(smokeOperatorEmail, 'operator', 'admin_operator_smoke');
  ensureAdmin(smokeSuperAdminEmail, 'super_admin', 'admin_super_smoke');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(admins, null, 2)}\n`, 'utf8');
}

async function seedOrderForUser(userId) {
  const filePath = path.join(dataDir, 'orders.json');
  const now = new Date().toISOString();
  let orders = [];

  try {
    orders = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {}

  orders.push({
    id: `order_${Date.now()}`,
    userId,
    outTradeNo: `trade_${Date.now()}`,
    subject: 'Admin smoke order',
    amount: 100,
    channel: 'alipay',
    method: 'alipay',
    paymentType: 'alipay',
    paymentProvider: 'junliai',
    status: 'pending',
    metadata: {
      source: 'tests/smoke-runner.mjs',
      kind: 'admin-orders',
    },
    paymentPayload: {
      integrationMode: 'skeleton',
    },
    createdAt: now,
    updatedAt: now,
  });

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(orders, null, 2)}\n`, 'utf8');
}

async function loginWithEmailCode(email, subjectType, cookieJar = '') {
  const requestCode = await apiRequest('POST', '/api/auth/email/request-code', {
    body: { email, subjectType },
  });
  assert(requestCode.statusCode === 200, `request-code failed for ${email}`);
  const devCode = requestCode.json?.delivery?.devCode;
  assert(devCode, `missing devCode for ${email}`);

  const verify = await apiRequest('POST', '/api/auth/email/verify-code', {
    body: { email, subjectType, code: devCode },
    cookieJar,
  });
  assert(verify.statusCode === 200, `verify-code failed for ${email}`);
  assert(verify.headers['set-cookie'], `missing set-cookie for ${email}`);
  assert(verify.json?.authenticated === true, `verify-code did not authenticate ${email}`);
  return verify.cookieJar;
}

async function readPage(route, fileName, hooks) {
  const filePath = path.join(projectRoot, 'public', fileName);
  const body = await fs.readFile(filePath, 'utf8');
  assertContains(body, '<!DOCTYPE html>', `${route} doctype`);
  for (const hook of hooks) {
    assertContains(body, hook, `${route} hook`);
  }
}

async function readAppScript(hooks) {
  const filePath = path.join(projectRoot, 'public', 'app.js');
  const body = await fs.readFile(filePath, 'utf8');
  for (const hook of hooks) {
    assertContains(body, hook, `public/app.js ${hook}`);
  }
}

await store.init();
await seedUser(smokeAuthEmail, smokeAuthSubjectType);
await seedAdmins();

await readPage('/', 'index.html', ['id="recent-orders"', 'id="recent-video-tasks"', 'id="refresh-account"']);
await readPage('/login', 'login.html', [
  'id="login-form"',
  'id="login-email"',
  'id="login-subject-type"',
  'id="login-request-code"',
  'id="login-code-step"',
  'id="login-code"',
  'id="login-message"',
]);
await readPage('/profile', 'profile.html', [
  'id="profile-heading"',
  'id="profile-summary"',
  'id="refresh-account"',
  'id="account-balance"',
  'id="account-summary"',
]);
await readPage('/admin', 'admin.html', [
  'id="admin-summary"',
  'id="admin-message"',
  'id="admin-users-list"',
]);
await readPage('/image', 'image.html', [
  'id="image-form"',
  'id="image-thread"',
  'id="image-message"',
  'id="image-status"',
  'id="image-session-select"',
  'id="image-session-new"',
  'id="image-session-rename"',
  'id="image-session-delete"',
  'id="image-session-meta"',
  'id="image-followup-panel"',
  'id="image-composer-hint"',
  'name="prompt"',
  'name="model"',
  'name="size"',
  'name="quality"',
]);
await readPage('/video', 'video.html', [
  'id="video-form"',
  'id="video-thread"',
  'id="video-message"',
  'id="video-status"',
  'id="video-session-select"',
  'id="video-session-new"',
  'id="video-session-rename"',
  'id="video-session-delete"',
  'id="video-session-meta"',
  'id="video-attachment-trigger"',
  'id="video-attachment-input"',
  'id="video-attachment-panel"',
  'id="video-composer-hint"',
  'name="prompt"',
  'name="duration"',
  'name="resolution"',
  'name="aspectRatio"',
]);
await readPage('/recharge', 'recharge.html', ['id="recharge-form"', 'id="payment-result"', 'id="recent-orders"']);
await readAppScript([
  'const PROTECTED_PAGES = new Set(["home", "image", "video", "recharge", "profile", "admin"]);',
  'if (isProtectedPage() && !me.authenticated) {',
  'redirectToLogin();',
  "const redirectTo = new URLSearchParams(window.location.search).get(\"redirectTo\") || \"\";",
  'requestJson("/api/auth/password/login"',
  'requestJson("/api/auth/register"',
]);

const health = await apiRequest('GET', '/api/health');
assert(health.statusCode === 200, 'GET /api/health failed');
const runtimeConfig = await apiRequest('GET', '/api/config');
assert(runtimeConfig.statusCode === 200, 'GET /api/config failed');
const anonymousMe = await apiRequest('GET', '/api/me');
assert(anonymousMe.json?.authenticated === false, 'GET /api/me anonymous state failed');
const anonymousLogout = await apiRequest('POST', '/api/auth/logout', { body: {} });
assert(anonymousLogout.statusCode === 200, 'POST /api/auth/logout failed');

for (const [pathName, expectedStatus, label] of [
  ['/api/account', 401, 'GET /api/account anonymous guard'],
  ['/api/images/history?limit=1', 401, 'GET /api/images/history anonymous guard'],
  ['/api/videos/tasks?limit=1', 401, 'GET /api/videos/tasks anonymous guard'],
  ['/api/videos/history?limit=1', 401, 'GET /api/videos/history anonymous guard'],
  ['/api/recharge/orders?limit=1', 401, 'GET /api/recharge/orders anonymous guard'],
  ['/api/admin/users', 401, 'GET /api/admin/users anonymous guard'],
]) {
  const response = await apiRequest('GET', pathName);
  assert(response.statusCode === expectedStatus, label);
}

const registeredEmail = `registered-${Date.now()}@example.com`;
const registeredPassword = 'password123';
const registerResponse = await apiRequest('POST', '/api/auth/register', {
  body: { email: registeredEmail, password: registeredPassword },
});
assert(registerResponse.statusCode === 201, 'POST /api/auth/register failed');
assert(registerResponse.json?.activationRequired === true, 'register should require activation');
assert(registerResponse.json?.user?.email === registeredEmail, 'register user email mismatch');
assert(registerResponse.json?.user?.status === 'pending_activation', 'register user should be pending activation');
const registerDevCode = registerResponse.json?.delivery?.devCode;
assert(registerDevCode, 'register response missing devCode');
const activateResponse = await apiRequest('POST', '/api/auth/email/verify-code', {
  body: { email: registeredEmail, subjectType: 'user', code: registerDevCode },
});
assert(activateResponse.statusCode === 200, 'activation verify-code failed');
assert(activateResponse.json?.authenticated === true, 'activation should authenticate');
const registeredMe = await apiRequest('GET', '/api/me', { cookieJar: activateResponse.cookieJar });
assert(registeredMe.json?.authenticated === true, 'registered session should be authenticated');

const duplicateRegisterResponse = await apiRequest('POST', '/api/auth/register', {
  body: { email: registeredEmail, password: registeredPassword },
});
assert(duplicateRegisterResponse.statusCode === 400, 'duplicate register should fail');

const passwordLoginEmail = `password-${Date.now()}@example.com`;
await seedUser(passwordLoginEmail, 'user', 'user_password_smoke');
const { hashPassword } = await import('../src/utils.js');
await seedUserPassword(passwordLoginEmail, hashPassword('password123'));
const passwordLoginResponse = await apiRequest('POST', '/api/auth/password/login', {
  body: { email: passwordLoginEmail, password: 'password123', subjectType: 'user' },
});
assert(passwordLoginResponse.statusCode === 200, 'POST /api/auth/password/login failed');
assert(passwordLoginResponse.json?.authenticated === true, 'password login should authenticate');
const wrongPasswordResponse = await apiRequest('POST', '/api/auth/password/login', {
  body: { email: passwordLoginEmail, password: 'wrong-password', subjectType: 'user' },
});
assert(wrongPasswordResponse.statusCode === 400, 'wrong password should fail');

let userCookieJar = await loginWithEmailCode(smokeAuthEmail, smokeAuthSubjectType);
const operatorCookieJar = await loginWithEmailCode(smokeOperatorEmail, 'admin');
const superAdminCookieJar = await loginWithEmailCode(smokeSuperAdminEmail, 'admin');

const authenticatedMe = await apiRequest('GET', '/api/me', { cookieJar: userCookieJar });
assert(authenticatedMe.json?.authenticated === true, 'GET /api/me authenticated state failed');

for (const [pathName, label] of [
  ['/api/account', 'GET /api/account scoped balance'],
  ['/api/images/history?limit=1', 'GET /api/images/history scoped empty list'],
  ['/api/videos/tasks?limit=1', 'GET /api/videos/tasks scoped empty list'],
  ['/api/videos/history?limit=1', 'GET /api/videos/history scoped empty list'],
  ['/api/recharge/orders?limit=1', 'GET /api/recharge/orders scoped empty list'],
]) {
  const response = await apiRequest('GET', pathName, { cookieJar: userCookieJar });
  assert(response.statusCode === 200, `${label} status`);
}

const account = await apiRequest('GET', '/api/account', { cookieJar: userCookieJar });
assert(account.json?.balance === 0, 'GET /api/account balance mismatch');
for (const pathName of [
  '/api/images/history?limit=1',
  '/api/videos/tasks?limit=1',
  '/api/videos/history?limit=1',
  '/api/recharge/orders?limit=1',
]) {
  const response = await apiRequest('GET', pathName, { cookieJar: userCookieJar });
  assert(Array.isArray(response.json?.items) && response.json.items.length === 0, `${pathName} expected empty items`);
}

const adminList = await apiRequest('GET', '/api/admin/users?limit=20', { cookieJar: operatorCookieJar });
assert(adminList.statusCode === 200, 'operator GET /api/admin/users failed');
assert(adminList.bodyText.includes(`"email":"${smokeAuthEmail}"`), 'operator list missing seeded user');

const userDeniedAdmin = await apiRequest('GET', '/api/admin/users', { cookieJar: userCookieJar });
assert(userDeniedAdmin.statusCode === 403, 'user should be denied on admin API');

const operatorDeniedCreate = await apiRequest('POST', '/api/admin/users', {
  cookieJar: operatorCookieJar,
  body: { email: 'blocked-by-operator@example.com' },
});
assert(operatorDeniedCreate.statusCode === 403, 'operator should be denied user creation');

const managedUserEmail = `managed-${Date.now()}@example.com`;
const createManagedUserResponse = await apiRequest('POST', '/api/admin/users', {
  cookieJar: superAdminCookieJar,
  body: { email: managedUserEmail },
});
assert(createManagedUserResponse.statusCode === 201, 'super admin user creation failed');
const managedUserId = createManagedUserResponse.json?.user?.id;
assert(managedUserId, 'missing managed user id');

const managedUserDetail = await apiRequest('GET', `/api/admin/users/${managedUserId}`, {
  cookieJar: operatorCookieJar,
});
assert(managedUserDetail.statusCode === 200, 'operator GET /api/admin/users/:id failed');
assert(managedUserDetail.json?.user?.id === managedUserId, 'managed user detail id mismatch');
assert(managedUserDetail.json?.stats?.orderCount === 0, 'managed user initial stats mismatch');

const operatorDeniedAdjustment = await apiRequest(
  'POST',
  `/api/admin/users/${managedUserId}/balance-adjustments`,
  {
    cookieJar: operatorCookieJar,
    body: { amountDelta: 100, reason: 'operator denied' },
  },
);
assert(operatorDeniedAdjustment.statusCode === 403, 'operator should be denied balance adjustment');

const adjustment = await apiRequest('POST', `/api/admin/users/${managedUserId}/balance-adjustments`, {
  cookieJar: superAdminCookieJar,
  body: { amountDelta: 250, reason: 'smoke credit' },
});
assert(adjustment.statusCode === 200, 'super admin balance adjustment failed');
assert(adjustment.json?.adjustment?.amountDelta === 250, 'balance adjustment delta mismatch');
assert(adjustment.json?.account?.balance === 250, 'balance adjustment balance mismatch');

await seedOrderForUser(managedUserId);

const managedUserOrders = await apiRequest('GET', `/api/admin/users/${managedUserId}/orders?limit=10`, {
  cookieJar: operatorCookieJar,
});
assert(managedUserOrders.statusCode === 200, 'admin GET /api/admin/users/:id/orders failed');
assert(managedUserOrders.json?.total === 1, 'managed user orders total mismatch');
assert(managedUserOrders.bodyText.includes(`"userId":"${managedUserId}"`), 'managed user order owner mismatch');

const disabledUser = await apiRequest('POST', `/api/admin/users/${managedUserId}/disable`, {
  cookieJar: superAdminCookieJar,
  body: {},
});
assert(disabledUser.statusCode === 200, 'super admin disable failed');
assert(disabledUser.json?.user?.status === 'disabled', 'disable response status mismatch');

const disabledUserCodeRequest = await apiRequest('POST', '/api/auth/email/request-code', {
  body: { email: managedUserEmail, subjectType: 'user' },
});
assert(disabledUserCodeRequest.statusCode === 400, 'disabled user should not receive login code');

const enabledUser = await apiRequest('POST', `/api/admin/users/${managedUserId}/enable`, {
  cookieJar: superAdminCookieJar,
  body: {},
});
assert(enabledUser.statusCode === 200, 'super admin enable failed');
assert(enabledUser.json?.user?.status === 'active', 'enable response status mismatch');

const checked = [
  'GET /',
  'GET /login',
  'GET /profile',
  'GET /admin',
  'GET /image',
  'GET /video',
  'GET /recharge',
  'frontend protected-page login redirect contract',
  'GET /api/health',
  'GET /api/config',
  'GET /api/me',
  'POST /api/auth/register',
  'POST /api/auth/password/login',
  'POST /api/auth/logout',
  'anonymous guards on user-owned APIs',
  'anonymous guard on /api/admin/users',
  'authenticated GET /api/account',
  'authenticated GET /api/images/history?limit=1',
  'authenticated GET /api/videos/tasks?limit=1',
  'authenticated GET /api/videos/history?limit=1',
  'authenticated GET /api/recharge/orders?limit=1',
  'operator GET /api/admin/users',
  'operator GET /api/admin/users/:id',
  'operator denied on POST /api/admin/users',
  'operator denied on POST /api/admin/users/:id/balance-adjustments',
  'super admin POST /api/admin/users',
  'super admin POST /api/admin/users/:id/balance-adjustments',
  'super admin POST /api/admin/users/:id/disable',
  'super admin POST /api/admin/users/:id/enable',
  'GET /api/admin/users/:id/orders',
];

if (writeMode) {
  const smokeOrder = await apiRequest('POST', '/api/recharge/orders', {
    cookieJar: userCookieJar,
    body: {
      channel: 'alipay',
      amount: 100,
      subject: 'Junliai smoke recharge',
      metadata: {
        source: 'tests/smoke-runner.mjs',
      },
    },
  });
  assert(smokeOrder.statusCode === 201, 'SMOKE_WRITE recharge order failed');
  assert(smokeOrder.json?.channel === 'alipay', 'SMOKE_WRITE recharge channel mismatch');
  assert(smokeOrder.json?.paymentProvider === 'junliai', 'SMOKE_WRITE payment provider mismatch');
  assert(smokeOrder.json?.id, 'SMOKE_WRITE missing order id');
  assert(smokeOrder.json?.amount === 100, 'SMOKE_WRITE amount mismatch');
  const smokeOrders = await apiRequest('GET', '/api/recharge/orders?limit=1', { cookieJar: userCookieJar });
  assert(smokeOrders.json?.total === 1, 'SMOKE_WRITE total orders mismatch');
  assert(smokeOrders.bodyText.includes('"userId":"user_smoke"'), 'SMOKE_WRITE order owner mismatch');
  checked.push('POST /api/recharge/orders');
}

process.stdout.write(`${JSON.stringify({ ok: true, checked })}\n`);
