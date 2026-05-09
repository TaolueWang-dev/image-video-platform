import { badRequest, notFound } from '../errors.js';
import { nowIso, randomId, requireString } from '../utils.js';

function normalizeEmail(value) {
  return requireString(value, 'email').toLowerCase();
}

function normalizeUserStatus(value, fallback = 'active') {
  const status = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : fallback;
  if (status !== 'active' && status !== 'disabled') {
    throw badRequest('Field "status" must be "active" or "disabled"');
  }
  return status;
}

function normalizeAdjustmentDelta(payload) {
  const candidates = [payload?.amountDelta, payload?.delta, payload?.amount];
  const value = candidates.find((item) => item !== undefined);
  if (!Number.isInteger(value) || value === 0) {
    throw badRequest('Field "amountDelta" must be a non-zero integer');
  }
  return value;
}

export async function listManagedUsers(store) {
  const [users, accounts] = await Promise.all([store.listUsers(), store.listAccounts()]);
  const accountMap = new Map(accounts.map((item) => [item.userId, item]));

  return [...users]
    .sort((left, right) => {
      const leftValue = left.updatedAt || left.createdAt || '';
      const rightValue = right.updatedAt || right.createdAt || '';
      return rightValue.localeCompare(leftValue);
    })
    .map((user) => ({
      ...user,
      account: accountMap.get(user.id) || null,
    }));
}

export async function createManagedUser(deps, actor, payload) {
  const email = normalizeEmail(payload?.email);
  const status = normalizeUserStatus(payload?.status);
  const existing = await deps.store.findUserByEmail(email);
  if (existing) {
    throw badRequest('User email already exists');
  }

  const timestamp = nowIso();
  const user = {
    id: randomId('user'),
    email,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: '',
  };

  await deps.store.replaceUser(user);
  const account = await deps.store.getAccountByUserId(user.id);
  await deps.store.appendAuditEvent({
    type: 'admin.user_created',
    actorType: 'admin',
    actorId: actor.id,
    targetType: 'user',
    targetId: user.id,
    metadata: {
      email: user.email,
      status: user.status,
    },
    createdAt: timestamp,
  });

  return {
    user,
    account,
  };
}

export async function getManagedUserById(store, userId) {
  const user = await store.findUserById(userId);
  if (!user) {
    throw notFound(`Unknown user: ${userId}`);
  }

  const [account, orders, imageHistory, videoTasks] = await Promise.all([
    store.getAccountByUserId(user.id),
    store.listOrdersByUserId(user.id),
    store.listImageHistoryByUserId(user.id),
    store.listVideoTasksByUserId(user.id),
  ]);

  return {
    user,
    account,
    stats: {
      orderCount: orders.length,
      paidOrderCount: orders.filter((item) => item.status === 'paid').length,
      pendingOrderCount: orders.filter((item) => item.status === 'pending').length,
      imageHistoryCount: imageHistory.length,
      videoTaskCount: videoTasks.length,
    },
  };
}

export async function setManagedUserStatus(deps, actor, userId, status) {
  const user = await deps.store.findUserById(userId);
  if (!user) {
    throw notFound(`Unknown user: ${userId}`);
  }

  const nextStatus = normalizeUserStatus(status);
  const timestamp = nowIso();
  const nextUser = {
    ...user,
    status: nextStatus,
    updatedAt: timestamp,
  };

  await deps.store.replaceUser(nextUser);
  await deps.store.appendAuditEvent({
    type: `admin.user_${nextStatus === 'active' ? 'enabled' : 'disabled'}`,
    actorType: 'admin',
    actorId: actor.id,
    targetType: 'user',
    targetId: nextUser.id,
    metadata: {
      email: nextUser.email,
      status: nextUser.status,
    },
    createdAt: timestamp,
  });

  return nextUser;
}

export async function listManagedUserOrders(store, userId) {
  const user = await store.findUserById(userId);
  if (!user) {
    throw notFound(`Unknown user: ${userId}`);
  }

  const orders = await store.listOrdersByUserId(userId);
  return orders.sort((left, right) => {
    const leftValue = left.updatedAt || left.createdAt || '';
    const rightValue = right.updatedAt || right.createdAt || '';
    return rightValue.localeCompare(leftValue);
  });
}

export async function createBalanceAdjustment(deps, actor, userId, payload) {
  const user = await deps.store.findUserById(userId);
  if (!user) {
    throw notFound(`Unknown user: ${userId}`);
  }

  const amountDelta = normalizeAdjustmentDelta(payload);
  const reason = requireString(payload?.reason, 'reason');
  const timestamp = nowIso();

  const account = await deps.store.updateAccountByUserId(userId, (current) => ({
    ...current,
    balance: current.balance + amountDelta,
    updatedAt: timestamp,
  }));

  await deps.store.appendAuditEvent({
    type: 'admin.user_balance_adjusted',
    actorType: 'admin',
    actorId: actor.id,
    targetType: 'account',
    targetId: account.id,
    metadata: {
      userId,
      email: user.email,
      amountDelta,
      reason,
      nextBalance: account.balance,
      currency: account.currency,
    },
    createdAt: timestamp,
  });

  return {
    account,
    adjustment: {
      userId,
      amountDelta,
      reason,
      createdAt: timestamp,
    },
  };
}
