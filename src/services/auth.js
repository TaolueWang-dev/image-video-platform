import { AppError, badRequest } from '../errors.js';
import {
  addMilliseconds,
  getHeader,
  hashPassword,
  nowIso,
  parseCookies,
  randomDigits,
  randomId,
  serializeCookie,
  sha256,
  verifyPassword,
} from '../utils.js';

function normalizeEmail(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest('Field "email" must be a non-empty string');
  }
  return value.trim().toLowerCase();
}

function normalizeCode(value, expectedLength) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw badRequest('Field "code" must be a numeric string');
  }
  const trimmed = value.trim();
  if (trimmed.length !== expectedLength) {
    throw badRequest(`Field "code" must be ${expectedLength} digits`);
  }
  return trimmed;
}

function normalizePassword(value, minimumLength) {
  if (typeof value !== 'string') {
    throw badRequest('Field "password" must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length < minimumLength) {
    throw badRequest(`Field "password" must be at least ${minimumLength} characters`);
  }
  return trimmed;
}

function normalizeSubjectType(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (value === 'user' || value === 'admin') {
    return value;
  }
  throw badRequest('Field "subjectType" must be "user" or "admin"');
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || '',
  };
}

function sanitizeAdmin(admin) {
  if (!admin) {
    return null;
  }
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    status: admin.status,
    hasPassword: Boolean(admin.passwordHash),
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
    lastLoginAt: admin.lastLoginAt || '',
  };
}

function isLiveSession(session, now) {
  return Boolean(session) && !session.revokedAt && session.expiresAt > now;
}

function buildCookieOptions(config, maxAgeSeconds) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.env === 'production',
    maxAge: maxAgeSeconds,
  };
}

async function createAuthenticatedSession(deps, req, loginTarget, context) {
  const { config, store } = deps;
  const timestamp = nowIso();
  const session = {
    id: randomId('sess'),
    subjectType: loginTarget.subjectType,
    subjectId: loginTarget.subject.id,
    email: loginTarget.subject.email,
    role: loginTarget.subjectType === 'admin' ? loginTarget.subject.role : '',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSeenAt: timestamp,
    expiresAt: addMilliseconds(timestamp, config.auth.sessionTtlMs),
    revokedAt: '',
    ip: context.ip,
    userAgent: getHeader(req, 'user-agent') || '',
  };
  await store.createSession(session);

  const updatedSubject = {
    ...loginTarget.subject,
    lastLoginAt: timestamp,
    updatedAt: timestamp,
  };
  if (loginTarget.subjectType === 'user') {
    await store.replaceUser(updatedSubject);
  } else {
    await store.replaceAdminUser(updatedSubject);
  }

  await store.appendAuditEvent({
    type: `${loginTarget.subjectType}.login`,
    actorType: loginTarget.subjectType,
    actorId: updatedSubject.id,
    targetType: 'session',
    targetId: session.id,
    metadata: {
      email: loginTarget.subject.email,
      ip: context.ip,
      role: session.role || '',
      method: context?.authMethod || 'unknown',
    },
    createdAt: timestamp,
  });

  const maxAgeSeconds = Math.floor(config.auth.sessionTtlMs / 1000);
  return {
    payload: buildMePayload(session, updatedSubject),
    cookie: serializeCookie(
      config.auth.sessionCookieName,
      session.id,
      buildCookieOptions(config, maxAgeSeconds),
    ),
  };
}

async function resolveLoginTarget(store, email, requestedSubjectType) {
  const [user, admin] = await Promise.all([store.findUserByEmail(email), store.findAdminByEmail(email)]);
  if (requestedSubjectType === 'user') {
    if (!user) {
      throw badRequest('Unknown user account');
    }
    return { subjectType: 'user', subject: user };
  }
  if (requestedSubjectType === 'admin') {
    if (!admin) {
      throw badRequest('Unknown admin account');
    }
    return { subjectType: 'admin', subject: admin };
  }

  if (user && admin) {
    throw badRequest('Field "subjectType" is required for accounts that exist in both user and admin scopes');
  }
  if (user) {
    return { subjectType: 'user', subject: user };
  }
  if (admin) {
    return { subjectType: 'admin', subject: admin };
  }
  throw badRequest('Unknown account');
}

function assertLoginAllowed(subjectType, subject) {
  if (subjectType === 'user') {
    if (subject.status !== 'active') {
      throw badRequest('User account is not available for login');
    }
    return;
  }

  if (subject.status !== 'active') {
    throw badRequest('Admin account is not available for login');
  }
}

function assertCodeRequestAllowed(subjectType, subject) {
  if (subjectType === 'user') {
    if (subject.status !== 'active' && subject.status !== 'pending_activation') {
      throw badRequest('User account is not available for verification');
    }
    return;
  }

  if (subject.status !== 'active') {
    throw badRequest('Admin account is not available for verification');
  }
}

function isActiveSubject(subject) {
  return Boolean(subject) && subject.status === 'active';
}

async function deliverVerificationCode(deps, options) {
  const { config, logger, mailer } = deps;
  const {
    email,
    subjectType,
    code,
    createdAt,
    requestId,
    purpose = 'login',
  } = options;

  const expiresAt = addMilliseconds(createdAt, config.auth.codeTtlMs);
  if (config.auth.emailDeliveryMode === 'disabled') {
    throw new AppError(503, 'Email verification delivery is disabled', {
      code: 'email_delivery_disabled',
      purpose,
    });
  }
  if (config.auth.emailDeliveryMode === 'log') {
    logger.info('auth.code_issued', {
      requestId,
      email,
      subjectType,
      code,
      expiresAt,
      purpose,
    });
  }
  if (config.auth.emailDeliveryMode === 'smtp') {
    await mailer.sendAuthCodeEmail({
      toEmail: email,
      code,
      expiresInSeconds: Math.floor(config.auth.codeTtlMs / 1000),
      purpose,
    });
  }

  const delivery = {
    mode: config.auth.emailDeliveryMode,
    expiresInSeconds: Math.floor(config.auth.codeTtlMs / 1000),
  };
  if (config.auth.exposeDevCode) {
    delivery.devCode = code;
  }
  return delivery;
}

function buildMePayload(session, subject) {
  const user = session?.subjectType === 'user' ? sanitizeUser(subject) : null;
  const admin = session?.subjectType === 'admin' ? sanitizeAdmin(subject) : null;
  return {
    authenticated: Boolean(session && subject),
    session: session
      ? {
          id: session.id,
          subjectType: session.subjectType,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastSeenAt: session.lastSeenAt || session.createdAt,
        }
      : null,
    user,
    admin,
    data: {
      authenticated: Boolean(session && subject),
      session: session
        ? {
            id: session.id,
            subjectType: session.subjectType,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            lastSeenAt: session.lastSeenAt || session.createdAt,
          }
        : null,
      user,
      admin,
    },
  };
}

export async function requestEmailLoginCode(deps, payload, context) {
  const { config, store, rateLimiter } = deps;
  const email = normalizeEmail(payload?.email);
  const requestedSubjectType = normalizeSubjectType(payload?.subjectType);
  const loginTarget = await resolveLoginTarget(store, email, requestedSubjectType);
  assertCodeRequestAllowed(loginTarget.subjectType, loginTarget.subject);

  const windowMs = config.auth.emailRequestLimitWindowMs;
  const emailLimit = rateLimiter.check(`auth:email:${email}`, {
    limit: config.auth.emailRequestLimitPerEmail,
    windowMs,
  });
  const ipLimit = rateLimiter.check(`auth:ip:${context.ip}`, {
    limit: config.auth.emailRequestLimitPerIp,
    windowMs,
  });
  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfterMs = Math.max(emailLimit.retryAfterMs || 0, ipLimit.retryAfterMs || 0);
    throw new AppError(429, 'Too many verification code requests', {
      retryAfterMs,
      emailRemaining: emailLimit.remaining,
      ipRemaining: ipLimit.remaining,
    });
  }

  const createdAt = nowIso();
  const code = randomDigits(config.auth.codeLength);
  await store.createEmailLoginCode({
    id: randomId('code'),
    email,
    subjectType: loginTarget.subjectType,
    subjectId: loginTarget.subject.id,
    codeHash: sha256(code),
    createdAt,
    updatedAt: createdAt,
    expiresAt: addMilliseconds(createdAt, config.auth.codeTtlMs),
    usedAt: '',
    revokedAt: '',
    requestIp: context.ip,
  });

  const delivery = await deliverVerificationCode(deps, {
    email,
    subjectType: loginTarget.subjectType,
    code,
    createdAt,
    requestId: context.requestId,
    purpose: 'login',
  });

  return {
    ok: true,
    email,
    subjectType: loginTarget.subjectType,
    delivery,
    data: {
      email,
      subjectType: loginTarget.subjectType,
      delivery,
    },
  };
}

export async function verifyEmailLoginCode(deps, req, payload, context) {
  const { config, store } = deps;
  const email = normalizeEmail(payload?.email);
  const code = normalizeCode(payload?.code, config.auth.codeLength);
  const requestedSubjectType = normalizeSubjectType(payload?.subjectType);
  const loginTarget = await resolveLoginTarget(store, email, requestedSubjectType);
  assertCodeRequestAllowed(loginTarget.subjectType, loginTarget.subject);

  const codeRecord = await store.findActiveEmailLoginCode(
    email,
    loginTarget.subjectType,
    sha256(code),
    nowIso(),
  );
  if (!codeRecord) {
    throw badRequest('Invalid or expired verification code');
  }

  const timestamp = nowIso();
  await store.markEmailLoginCodeUsed(codeRecord.id, timestamp);
  if (loginTarget.subjectType === 'user' && loginTarget.subject.status === 'pending_activation') {
    loginTarget.subject = {
      ...loginTarget.subject,
      status: 'active',
      updatedAt: timestamp,
    };
    await store.replaceUser(loginTarget.subject);
    await store.appendAuditEvent({
      type: 'user.activated',
      actorType: 'user',
      actorId: loginTarget.subject.id,
      targetType: 'user',
      targetId: loginTarget.subject.id,
      metadata: {
        email: loginTarget.subject.email,
        method: 'email_code',
        ip: context.ip,
      },
      createdAt: timestamp,
    });
  }
  return createAuthenticatedSession(deps, req, loginTarget, {
    ...context,
    authMethod: 'email_code',
  });
}

export async function verifyRegistrationCode(deps, payload, context) {
  const { config, store } = deps;
  const email = normalizeEmail(payload?.email);
  const code = normalizeCode(payload?.code, config.auth.codeLength);

  const user = await store.findUserByEmail(email);
  if (!user) {
    throw badRequest('Unknown user account');
  }
  if (user.status !== 'pending_activation') {
    throw badRequest('User account is already active');
  }

  const codeRecord = await store.findActiveEmailLoginCode(
    email,
    'user',
    sha256(code),
    nowIso(),
  );
  if (!codeRecord) {
    throw badRequest('Invalid or expired verification code');
  }

  const timestamp = nowIso();
  await store.markEmailLoginCodeUsed(codeRecord.id, timestamp);
  const nextUser = {
    ...user,
    status: 'active',
    updatedAt: timestamp,
  };
  await store.replaceUser(nextUser);
  await store.appendAuditEvent({
    type: 'user.activated',
    actorType: 'user',
    actorId: nextUser.id,
    targetType: 'user',
    targetId: nextUser.id,
    metadata: {
      email: nextUser.email,
      method: 'email_code',
      ip: context.ip,
    },
    createdAt: timestamp,
  });

  return {
    ok: true,
    activated: true,
    email: nextUser.email,
    user: sanitizeUser(nextUser),
    data: {
      activated: true,
      email: nextUser.email,
      user: sanitizeUser(nextUser),
    },
  };
}

export async function registerWithPassword(deps, req, payload, context) {
  const { config, store } = deps;
  if (!config.auth.registrationEnabled) {
    throw new AppError(403, 'Public registration is disabled');
  }

  const email = normalizeEmail(payload?.email);
  const password = normalizePassword(payload?.password, config.auth.passwordMinLength);

  const [existingUser, existingAdmin] = await Promise.all([
    store.findUserByEmail(email),
    store.findAdminByEmail(email),
  ]);
  if (existingAdmin || (existingUser && existingUser.status !== 'pending_activation')) {
    throw badRequest('Account email already exists');
  }

  const timestamp = nowIso();
  const code = randomDigits(config.auth.codeLength);
  const user = existingUser
    ? {
        ...existingUser,
        passwordHash: hashPassword(password),
        updatedAt: timestamp,
      }
    : {
        id: randomId('user'),
        email,
        status: 'pending_activation',
        passwordHash: hashPassword(password),
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: '',
      };

  await store.replaceUser(user);
  await store.getAccountByUserId(user.id);
  await store.createEmailLoginCode({
    id: randomId('code'),
    email,
    subjectType: 'user',
    subjectId: user.id,
    codeHash: sha256(code),
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: addMilliseconds(timestamp, config.auth.codeTtlMs),
    usedAt: '',
    revokedAt: '',
    requestIp: context.ip,
  });
  await store.appendAuditEvent({
    type: 'user.registered',
    actorType: 'user',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
    metadata: {
      email: user.email,
      method: 'password',
      ip: context.ip,
    },
    createdAt: timestamp,
  });
  const delivery = await deliverVerificationCode(deps, {
    email,
    subjectType: 'user',
    code,
    createdAt: timestamp,
    requestId: context.requestId,
    purpose: 'activation',
  });

  return {
    ok: true,
    activationRequired: true,
    email,
    subjectType: 'user',
    delivery,
    user: sanitizeUser(user),
    data: {
      activationRequired: true,
      email,
      subjectType: 'user',
      delivery,
      user: sanitizeUser(user),
    },
  };
}

export async function loginWithPassword(deps, req, payload, context) {
  const { config, store } = deps;
  const email = normalizeEmail(payload?.email);
  const password = normalizePassword(payload?.password, config.auth.passwordMinLength);
  const requestedSubjectType = normalizeSubjectType(payload?.subjectType || 'user');

  if (requestedSubjectType === 'admin') {
    const admin = await store.findAdminByEmail(email);
    if (!admin) {
      throw badRequest('Unknown admin account');
    }
    assertLoginAllowed('admin', admin);
    if (!admin.passwordHash) {
      throw badRequest('Admin password login is not configured');
    }
    if (!verifyPassword(password, admin.passwordHash)) {
      throw badRequest('Invalid email or password');
    }

    return createAuthenticatedSession(
      deps,
      req,
      {
        subjectType: 'admin',
        subject: admin,
      },
      {
        ...context,
        authMethod: 'password_login',
      },
    );
  }

  const user = await store.findUserByEmail(email);
  if (!user) {
    throw badRequest('Unknown user account');
  }
  assertLoginAllowed('user', user);
  if (!verifyPassword(password, user.passwordHash || '')) {
    throw badRequest('Invalid email or password');
  }

  return createAuthenticatedSession(
    deps,
    req,
    {
      subjectType: 'user',
      subject: user,
    },
    {
      ...context,
      authMethod: 'password_login',
    },
  );
}

export async function getSessionFromRequest(deps, req) {
  const { config, store } = deps;
  const cookies = parseCookies(getHeader(req, 'cookie'));
  const sessionId = cookies[config.auth.sessionCookieName];
  if (!sessionId) {
    return {
      session: null,
      subject: null,
    };
  }

  const now = nowIso();
  const session = await store.findSessionById(sessionId);
  if (!isLiveSession(session, now)) {
    if (session && !session.revokedAt && session.expiresAt <= now) {
      await store.revokeSession(session.id, now);
    }
    return {
      session: null,
      subject: null,
    };
  }

  const subject =
    session.subjectType === 'admin'
      ? await store.findAdminById(session.subjectId)
      : await store.findUserById(session.subjectId);

  if (!subject || !isActiveSubject(subject)) {
    await store.revokeSession(session.id, now);
    return {
      session: null,
      subject: null,
    };
  }

  await store.touchSession(session.id, now);
  return {
    session: {
      ...session,
      lastSeenAt: now,
      updatedAt: now,
    },
    subject,
  };
}

export async function getMe(deps, req) {
  const { session, subject } = await getSessionFromRequest(deps, req);
  return buildMePayload(session, subject);
}

export async function requireUserSession(deps, req) {
  const { session, subject } = await getSessionFromRequest(deps, req);
  if (!session || !subject) {
    throw new AppError(401, 'Authentication required');
  }
  if (session.subjectType !== 'user') {
    throw new AppError(403, 'User account required');
  }

  return {
    session,
    user: subject,
  };
}

export async function requireAdminSession(deps, req, options = {}) {
  const { session, subject } = await getSessionFromRequest(deps, req);
  if (!session || !subject) {
    throw new AppError(401, 'Authentication required');
  }
  if (session.subjectType !== 'admin') {
    throw new AppError(403, 'Admin account required');
  }

  const allowedRoles = Array.isArray(options.allowedRoles) ? options.allowedRoles.filter(Boolean) : [];
  if (allowedRoles.length > 0 && !allowedRoles.includes(subject.role)) {
    throw new AppError(403, 'Insufficient admin role');
  }

  return {
    session,
    admin: subject,
  };
}

export async function logout(deps, req, context) {
  const { config, store } = deps;
  const { session } = await getSessionFromRequest(deps, req);
  const timestamp = nowIso();
  if (session) {
    await store.revokeSession(session.id, timestamp);
    await store.appendAuditEvent({
      type: `${session.subjectType}.logout`,
      actorType: session.subjectType,
      actorId: session.subjectId,
      targetType: 'session',
      targetId: session.id,
      metadata: {
        email: session.email,
        ip: context?.ip || '',
      },
      createdAt: timestamp,
    });
  }

  return {
    payload: {
      ok: true,
      data: {
        ok: true,
      },
    },
    cookie: serializeCookie(config.auth.sessionCookieName, '', buildCookieOptions(config, 0)),
  };
}
