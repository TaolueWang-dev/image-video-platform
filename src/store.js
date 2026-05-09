import path from 'node:path';

import { ensureDir, nowIso, readJsonFile, resolveProjectPath, writeJsonFile } from './utils.js';

function createDefaultAccount(config) {
  return {
    id: 'default',
    balance: config.defaults.openingBalance,
    currency: config.defaults.currency,
    updatedAt: nowIso(),
  };
}

function createUserAccount(config, userId) {
  const timestamp = nowIso();
  return {
    id: `account_${userId}`,
    userId,
    balance: config.defaults.openingBalance,
    currency: config.defaults.currency,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class DataStore {
  constructor(config) {
    this.config = config;
    this.dataDir = resolveProjectPath(config.dataDir);
    this.accountFile = path.join(this.dataDir, 'account.json');
    this.accountsFile = path.join(this.dataDir, 'accounts.json');
    this.ordersFile = path.join(this.dataDir, 'orders.json');
    this.imageHistoryFile = path.join(this.dataDir, 'image-history.json');
    this.videoTasksFile = path.join(this.dataDir, 'video-tasks.json');
    this.paymentEventsFile = path.join(this.dataDir, 'payment-events.json');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.adminUsersFile = path.join(this.dataDir, 'admin-users.json');
    this.sessionsFile = path.join(this.dataDir, 'sessions.json');
    this.emailLoginCodesFile = path.join(this.dataDir, 'email-login-codes.json');
    this.auditLogFile = path.join(this.dataDir, 'audit-log.json');
    this.writeChain = Promise.resolve();
  }

  async init() {
    await ensureDir(this.dataDir);
    await Promise.all([
      readJsonFile(this.accountFile, createDefaultAccount(this.config)),
      readJsonFile(this.accountsFile, []),
      readJsonFile(this.ordersFile, []),
      readJsonFile(this.imageHistoryFile, []),
      readJsonFile(this.videoTasksFile, []),
      readJsonFile(this.paymentEventsFile, []),
      readJsonFile(this.usersFile, []),
      readJsonFile(this.adminUsersFile, []),
      readJsonFile(this.sessionsFile, []),
      readJsonFile(this.emailLoginCodesFile, []),
      readJsonFile(this.auditLogFile, []),
    ]);
    await this.ensureSeedAdmin();
  }

  async ensureSeedAdmin() {
    const email = this.config.auth.superAdmin.email;
    if (!email) {
      return null;
    }

    return this.withWriteLock(async () => {
      const admins = await this.listAdminUsers();
      const existing = admins.find((item) => item.email === email) || null;
      if (existing) {
        if (existing.role === this.config.auth.superAdmin.role && existing.status === 'active') {
          return existing;
        }
        const updated = {
          ...existing,
          role: this.config.auth.superAdmin.role,
          status: 'active',
          updatedAt: nowIso(),
        };
        await this.replaceAdminUser(updated);
        return updated;
      }

      const timestamp = nowIso();
      const admin = {
        id: `admin_${Date.now()}`,
        email,
        role: this.config.auth.superAdmin.role,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      admins.push(admin);
      const events = await this.listAuditEvents();
      events.push({
        type: 'admin.seeded',
        actorType: 'system',
        actorId: 'bootstrap',
        targetType: 'admin',
        targetId: admin.id,
        metadata: {
          email: admin.email,
          role: admin.role,
        },
        createdAt: timestamp,
      });
      await this.saveAdminUsers(admins);
      await this.saveAuditEvents(events);
      return admin;
    });
  }

  async getAccount() {
    return readJsonFile(this.accountFile, createDefaultAccount(this.config));
  }

  async listAccounts() {
    return readJsonFile(this.accountsFile, []);
  }

  async saveAccounts(accounts) {
    await writeJsonFile(this.accountsFile, accounts);
    return accounts;
  }

  async getAccountByUserId(userId) {
    const accounts = await this.listAccounts();
    const existing = accounts.find((item) => item.userId === userId) || null;
    if (existing) {
      return existing;
    }

    const account = createUserAccount(this.config, userId);
    await this.replaceAccount(account);
    return account;
  }

  async replaceAccount(account) {
    return this.withWriteLock(async () => {
      const accounts = await this.listAccounts();
      const index = accounts.findIndex((item) => item.userId === account.userId);
      if (index >= 0) {
        accounts[index] = account;
      } else {
        accounts.push(account);
      }
      await this.saveAccounts(accounts);
      return account;
    });
  }

  async updateAccountByUserId(userId, mutator) {
    return this.withWriteLock(async () => {
      const accounts = await this.listAccounts();
      const index = accounts.findIndex((item) => item.userId === userId);
      const current = index >= 0 ? accounts[index] : createUserAccount(this.config, userId);
      const next = await mutator(current);
      if (index >= 0) {
        accounts[index] = next;
      } else {
        accounts.push(next);
      }
      await this.saveAccounts(accounts);
      return next;
    });
  }

  async setAccount(account) {
    await writeJsonFile(this.accountFile, account);
    return account;
  }

  async updateAccount(mutator) {
    const account = await this.getAccount();
    const next = await mutator(account);
    await this.setAccount(next);
    return next;
  }

  async listOrders() {
    return readJsonFile(this.ordersFile, []);
  }

  async saveOrders(orders) {
    await writeJsonFile(this.ordersFile, orders);
    return orders;
  }

  async upsertOrder(order) {
    return this.withWriteLock(async () => {
      const orders = await this.listOrders();
      const index = orders.findIndex((item) => item.id === order.id);
      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.push(order);
      }
      await this.saveOrders(orders);
      return order;
    });
  }

  async findOrderById(orderId) {
    const orders = await this.listOrders();
    return orders.find((item) => item.id === orderId) || null;
  }

  async findOrderByTradeNo(outTradeNo) {
    const orders = await this.listOrders();
    return orders.find((item) => item.outTradeNo === outTradeNo) || null;
  }

  async listOrdersByUserId(userId) {
    const orders = await this.listOrders();
    return orders.filter((item) => item.userId === userId);
  }

  async listImageHistory() {
    return readJsonFile(this.imageHistoryFile, []);
  }

  async saveImageHistory(entries) {
    await writeJsonFile(this.imageHistoryFile, entries);
    return entries;
  }

  async upsertImageHistory(entry) {
    return this.withWriteLock(async () => {
      const entries = await this.listImageHistory();
      const index = entries.findIndex((item) => item.id === entry.id);
      if (index >= 0) {
        entries[index] = entry;
      } else {
        entries.push(entry);
      }
      await this.saveImageHistory(entries);
      return entry;
    });
  }

  async findImageHistoryEntry(entryId) {
    const entries = await this.listImageHistory();
    return entries.find((item) => item.id === entryId) || null;
  }

  async findImageHistoryEntryByUserId(entryId, userId) {
    const entries = await this.listImageHistory();
    return entries.find((item) => item.id === entryId && item.userId === userId) || null;
  }

  async listImageHistoryByUserId(userId) {
    const entries = await this.listImageHistory();
    return entries.filter((item) => item.userId === userId);
  }

  async deleteImageHistoryBySessionId(sessionId) {
    return this.withWriteLock(async () => {
      const entries = await this.listImageHistory();
      const nextEntries = entries.filter((item) => item.sessionId !== sessionId);
      await this.saveImageHistory(nextEntries);
      return {
        deletedCount: entries.length - nextEntries.length,
      };
    });
  }

  async deleteImageHistoryBySessionIdForUser(sessionId, userId) {
    return this.withWriteLock(async () => {
      const entries = await this.listImageHistory();
      const nextEntries = entries.filter((item) => item.sessionId !== sessionId || item.userId !== userId);
      await this.saveImageHistory(nextEntries);
      return {
        deletedCount: entries.length - nextEntries.length,
      };
    });
  }

  async listVideoTasks() {
    return readJsonFile(this.videoTasksFile, []);
  }

  async saveVideoTasks(tasks) {
    await writeJsonFile(this.videoTasksFile, tasks);
    return tasks;
  }

  async upsertVideoTask(task) {
    return this.withWriteLock(async () => {
      const tasks = await this.listVideoTasks();
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) {
        tasks[index] = task;
      } else {
        tasks.push(task);
      }
      await this.saveVideoTasks(tasks);
      return task;
    });
  }

  async findVideoTask(taskId) {
    const tasks = await this.listVideoTasks();
    return tasks.find((item) => item.id === taskId) || null;
  }

  async findVideoTaskByUserId(taskId, userId) {
    const tasks = await this.listVideoTasks();
    return tasks.find((item) => item.id === taskId && item.userId === userId) || null;
  }

  async listVideoTasksByUserId(userId) {
    const tasks = await this.listVideoTasks();
    return tasks.filter((item) => item.userId === userId);
  }

  async deleteVideoTasksBySessionId(sessionId) {
    return this.withWriteLock(async () => {
      const tasks = await this.listVideoTasks();
      const nextTasks = tasks.filter((item) => item.sessionId !== sessionId);
      await this.saveVideoTasks(nextTasks);
      return {
        deletedCount: tasks.length - nextTasks.length,
      };
    });
  }

  async deleteVideoTasksBySessionIdForUser(sessionId, userId) {
    return this.withWriteLock(async () => {
      const tasks = await this.listVideoTasks();
      const nextTasks = tasks.filter((item) => item.sessionId !== sessionId || item.userId !== userId);
      await this.saveVideoTasks(nextTasks);
      return {
        deletedCount: tasks.length - nextTasks.length,
      };
    });
  }

  async listPaymentEvents() {
    return readJsonFile(this.paymentEventsFile, []);
  }

  async savePaymentEvents(events) {
    await writeJsonFile(this.paymentEventsFile, events);
    return events;
  }

  async listUsers() {
    return readJsonFile(this.usersFile, []);
  }

  async saveUsers(users) {
    await writeJsonFile(this.usersFile, users);
    return users;
  }

  async findUserByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }
    const users = await this.listUsers();
    return users.find((item) => item.email === normalizedEmail) || null;
  }

  async findUserById(userId) {
    const users = await this.listUsers();
    return users.find((item) => item.id === userId) || null;
  }

  async replaceUser(user) {
    return this.withWriteLock(async () => {
      const users = await this.listUsers();
      const index = users.findIndex((item) => item.id === user.id);
      if (index >= 0) {
        users[index] = user;
      } else {
        users.push(user);
      }
      await this.saveUsers(users);
      return user;
    });
  }

  async listAdminUsers() {
    return readJsonFile(this.adminUsersFile, []);
  }

  async saveAdminUsers(adminUsers) {
    await writeJsonFile(this.adminUsersFile, adminUsers);
    return adminUsers;
  }

  async findAdminByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }
    const admins = await this.listAdminUsers();
    return admins.find((item) => item.email === normalizedEmail) || null;
  }

  async findAdminById(adminId) {
    const admins = await this.listAdminUsers();
    return admins.find((item) => item.id === adminId) || null;
  }

  async replaceAdminUser(adminUser) {
    return this.withWriteLock(async () => {
      const admins = await this.listAdminUsers();
      const index = admins.findIndex((item) => item.id === adminUser.id);
      if (index >= 0) {
        admins[index] = adminUser;
      } else {
        admins.push(adminUser);
      }
      await this.saveAdminUsers(admins);
      return adminUser;
    });
  }

  async listSessions() {
    return readJsonFile(this.sessionsFile, []);
  }

  async saveSessions(sessions) {
    await writeJsonFile(this.sessionsFile, sessions);
    return sessions;
  }

  async createSession(session) {
    return this.withWriteLock(async () => {
      const sessions = await this.listSessions();
      sessions.push(session);
      await this.saveSessions(sessions);
      return session;
    });
  }

  async findSessionById(sessionId) {
    const sessions = await this.listSessions();
    return sessions.find((item) => item.id === sessionId) || null;
  }

  async revokeSession(sessionId, revokedAt = nowIso()) {
    return this.withWriteLock(async () => {
      const sessions = await this.listSessions();
      const index = sessions.findIndex((item) => item.id === sessionId);
      if (index < 0) {
        return null;
      }

      const current = sessions[index];
      const next = current.revokedAt ? current : { ...current, revokedAt, updatedAt: revokedAt };
      sessions[index] = next;
      await this.saveSessions(sessions);
      return next;
    });
  }

  async touchSession(sessionId, touchedAt = nowIso()) {
    return this.withWriteLock(async () => {
      const sessions = await this.listSessions();
      const index = sessions.findIndex((item) => item.id === sessionId);
      if (index < 0) {
        return null;
      }

      const current = sessions[index];
      if (current.revokedAt) {
        return current;
      }

      const next = {
        ...current,
        lastSeenAt: touchedAt,
        updatedAt: touchedAt,
      };
      sessions[index] = next;
      await this.saveSessions(sessions);
      return next;
    });
  }

  async listEmailLoginCodes() {
    return readJsonFile(this.emailLoginCodesFile, []);
  }

  async saveEmailLoginCodes(codes) {
    await writeJsonFile(this.emailLoginCodesFile, codes);
    return codes;
  }

  async createEmailLoginCode(codeRecord) {
    return this.withWriteLock(async () => {
      const codes = await this.listEmailLoginCodes();
      const nextCodes = codes.map((item) =>
        item.email === codeRecord.email && item.subjectType === codeRecord.subjectType && !item.usedAt
          ? { ...item, revokedAt: codeRecord.createdAt, updatedAt: codeRecord.createdAt }
          : item,
      );
      nextCodes.push(codeRecord);
      await this.saveEmailLoginCodes(nextCodes);
      return codeRecord;
    });
  }

  async findActiveEmailLoginCode(email, subjectType, codeHash, at = nowIso()) {
    const codes = await this.listEmailLoginCodes();
    return (
      codes.find(
        (item) =>
          item.email === email &&
          item.subjectType === subjectType &&
          item.codeHash === codeHash &&
          !item.usedAt &&
          !item.revokedAt &&
          item.expiresAt > at,
      ) || null
    );
  }

  async markEmailLoginCodeUsed(codeId, usedAt = nowIso()) {
    return this.withWriteLock(async () => {
      const codes = await this.listEmailLoginCodes();
      const index = codes.findIndex((item) => item.id === codeId);
      if (index < 0) {
        return null;
      }

      const next = {
        ...codes[index],
        usedAt,
        updatedAt: usedAt,
      };
      codes[index] = next;
      await this.saveEmailLoginCodes(codes);
      return next;
    });
  }

  async listAuditEvents() {
    return readJsonFile(this.auditLogFile, []);
  }

  async appendAuditEvent(event) {
    return this.withWriteLock(async () => {
      const events = await this.listAuditEvents();
      events.push({
        ...event,
        createdAt: event.createdAt || nowIso(),
      });
      await this.saveAuditEvents(events);
      return events[events.length - 1];
    });
  }

  async saveAuditEvents(events) {
    await writeJsonFile(this.auditLogFile, events);
    return events;
  }

  async withWriteLock(task) {
    const run = this.writeChain.then(task);
    this.writeChain = run.catch(() => {});
    return run;
  }

  async completeOrderPayment({ orderId, eventKey, provider, providerTradeNo, notifyPayload, paidAt }) {
    return this.withWriteLock(async () => {
      const [orders, accounts, paymentEvents] = await Promise.all([
        this.listOrders(),
        this.listAccounts(),
        this.listPaymentEvents(),
      ]);

      const existingEvent = paymentEvents.find((item) => item.eventKey === eventKey);
      if (existingEvent) {
        const existingOrder = orders.find((item) => item.id === orderId) || null;
        return {
          order: existingOrder,
          duplicate: true,
          applied: false,
          paymentEvent: existingEvent,
        };
      }

      const orderIndex = orders.findIndex((item) => item.id === orderId);
      if (orderIndex < 0) {
        return {
          order: null,
          duplicate: false,
          applied: false,
          paymentEvent: null,
        };
      }

      const currentOrder = orders[orderIndex];
      const nextOrder =
        currentOrder.status === 'paid'
          ? {
              ...currentOrder,
              updatedAt: paidAt,
              notifyPayload,
            }
          : {
              ...currentOrder,
              status: 'paid',
              paidAt,
              updatedAt: paidAt,
              notifyPayload,
            };

      orders[orderIndex] = nextOrder;

      const paymentEvent = {
        eventKey,
        orderId,
        provider,
        providerTradeNo: providerTradeNo || '',
        duplicate: currentOrder.status === 'paid',
        createdAt: paidAt,
      };
      paymentEvents.push(paymentEvent);

      if (currentOrder.status !== 'paid' && currentOrder.userId) {
        const accountIndex = accounts.findIndex((item) => item.userId === currentOrder.userId);
        const currentAccount =
          accountIndex >= 0 ? accounts[accountIndex] : createUserAccount(this.config, currentOrder.userId);
        const nextAccount = {
          ...currentAccount,
          balance: currentAccount.balance + nextOrder.amount,
          updatedAt: paidAt,
        };
        if (accountIndex >= 0) {
          accounts[accountIndex] = nextAccount;
        } else {
          accounts.push(nextAccount);
        }
      }

      await this.saveOrders(orders);
      await this.saveAccounts(accounts);
      await this.savePaymentEvents(paymentEvents);

      return {
        order: nextOrder,
        duplicate: false,
        applied: currentOrder.status !== 'paid',
        paymentEvent,
      };
    });
  }
}
