import { AppError, notFound, badRequest } from './errors.js';
import {
  createBalanceAdjustment,
  createManagedUser,
  getManagedUserById,
  listManagedUserOrders,
  listManagedUsers,
  setManagedUserStatus,
} from './services/admin.js';
import {
  getMe,
  loginWithPassword,
  logout,
  registerWithPassword,
  requestEmailLoginCode,
  requireUserSession,
  verifyRegistrationCode,
  verifyEmailLoginCode,
} from './services/auth.js';
import { requireAdminSession } from './services/auth.js';
import { createImageGeneration } from './services/images.js';
import { createRechargeOrder, handleJunliaiNotify } from './services/payments.js';
import { applyVideoCallback, createVideoTask, getVideoTask } from './services/videos.js';
import { json, readJsonBody, text } from './utils.js';

function withDataAliases(payload, extra = {}) {
  const hasOwnData = Boolean(payload) && Object.prototype.hasOwnProperty.call(payload, 'data');
  const data = hasOwnData ? payload.data : payload;
  return {
    ...payload,
    ...extra,
    data,
  };
}

function serializeConfig(config) {
  const payload = {
    imageModels: Array.isArray(config.openai.imageModels) ? config.openai.imageModels : [],
    defaultImageModel: config.openai.defaultModel || config.openai.imageModels[0] || '',
  };

  return withDataAliases(payload);
}

function serializeAccountPayload(account, stats) {
  const payload = {
    account,
    stats,
    balance: account?.balance,
    currency: account?.currency,
    updatedAt: account?.updatedAt || '',
  };

  return withDataAliases(payload, {
    totalOrders: stats?.orderCount ?? 0,
    totalVideoTasks: stats?.videoTaskCount ?? 0,
    pendingOrders: stats?.pendingOrderCount ?? 0,
  });
}

function normalizeImageItem(item, index = 0) {
  return {
    id: item?.id || `image_${index + 1}`,
    index: item?.index ?? index,
    url: item?.url || item?.image_url || '',
    image_url: item?.image_url || item?.url || '',
    b64Json: item?.b64Json || item?.b64_json || item?.b64 || '',
    b64_json: item?.b64_json || item?.b64Json || item?.b64 || '',
    mimeType: item?.mimeType || item?.mime_type || 'image/png',
    mime_type: item?.mime_type || item?.mimeType || 'image/png',
    revisedPrompt: item?.revisedPrompt || item?.revised_prompt || '',
    revised_prompt: item?.revised_prompt || item?.revisedPrompt || '',
  };
}

function serializeImageHistoryEntry(item) {
  const normalizedImages = Array.isArray(item?.images) ? item.images.map(normalizeImageItem) : [];
  return {
    ...item,
    id: item?.id || '',
    sessionId: item?.sessionId || item?.session_id || '',
    session_id: item?.session_id || item?.sessionId || '',
    parentId: item?.parentId || item?.parent_entry_id || '',
    parent_entry_id: item?.parent_entry_id || item?.parentId || '',
    prompt: item?.prompt || item?.request?.prompt || '',
    model: item?.model || item?.request?.model || '',
    images: normalizedImages,
    data: normalizedImages,
    referenceApplied: Boolean(item?.referenceApplied ?? item?.reference_applied),
    reference_applied: Boolean(item?.reference_applied ?? item?.referenceApplied),
    referenceImageApplied: Boolean(item?.referenceApplied ?? item?.reference_applied),
    referenceDowngraded: Boolean(item?.referenceDowngraded ?? item?.reference_downgraded),
    reference_downgraded: Boolean(item?.reference_downgraded ?? item?.referenceDowngraded),
    referenceImageDowngraded: Boolean(item?.referenceDowngraded ?? item?.reference_downgraded),
    referenceDowngradeReason:
      item?.referenceDowngradeReason || item?.reference_downgrade_reason || '',
    reference_downgrade_reason:
      item?.reference_downgrade_reason || item?.referenceDowngradeReason || '',
    referenceImageDowngradeReason:
      item?.referenceDowngradeReason || item?.reference_downgrade_reason || '',
    estimatedCharge: item?.estimatedCharge ?? 0,
    chargedAmount: item?.chargedAmount ?? 0,
    currency: item?.currency || 'CNY',
    billingStatus: item?.billingStatus || '',
    billingEventId: item?.billingEventId || '',
  };
}

function serializeVideoTask(item) {
  const request = item?.request || {};
  const remote = item?.remote || {};
  const requestContent = Array.isArray(request?.content) ? request.content : [];
  const attachments = requestContent
    .filter((contentItem) => contentItem?.type === 'image_url')
    .map((contentItem, index) => ({
      index,
      role: contentItem?.role || 'reference_image',
      name: contentItem?.name || `图片 ${index + 1}`,
      url: contentItem?.image_url?.url || contentItem?.image_url || '',
      image_url: contentItem?.image_url?.url || contentItem?.image_url || '',
    }));
  const prompt =
    requestContent.find((contentItem) => contentItem?.type === 'text')?.text ||
    request?.prompt ||
    item?.prompt ||
    '';
  const videoUrl =
    remote?.video_url ||
    remote?.content?.video_url ||
    item?.videoUrl ||
    item?.outputUrl ||
    item?.resultUrl ||
    '';
  const outputUrl = remote?.output_url || remote?.content?.output_url || item?.outputUrl || videoUrl;
  const resultUrl = remote?.result_url || remote?.content?.result_url || item?.resultUrl || videoUrl;

  return {
    ...item,
    id: item?.id || item?.taskId || remote?.id || '',
    taskId: item?.taskId || item?.id || remote?.id || '',
    task_id: item?.task_id || item?.taskId || item?.id || remote?.id || '',
    sessionId: item?.sessionId || item?.session_id || '',
    session_id: item?.session_id || item?.sessionId || '',
    parentId: item?.parentId || item?.parent_id || '',
    parent_id: item?.parent_id || item?.parentId || '',
    kind: item?.kind || 'generation',
    prompt,
    model: request?.model || item?.model || '',
    status: item?.status || remote?.status || 'queued',
    progress: item?.progress ?? remote?.progress ?? '',
    createdAt: item?.createdAt || remote?.created_at || '',
    updatedAt: item?.updatedAt || remote?.updated_at || '',
    attachments,
    videoUrl,
    video_url: videoUrl,
    outputUrl,
    output_url: outputUrl,
    resultUrl,
    result_url: resultUrl,
    estimatedCharge: item?.estimatedCharge ?? 0,
    chargedAmount: item?.chargedAmount ?? 0,
    currency: item?.currency || 'CNY',
    billingStatus: item?.billingStatus || '',
    billingEventId: item?.billingEventId || '',
    error: item?.error || remote?.error || '',
    message: item?.message || remote?.message || '',
  };
}

function serializeBillingEvent(item) {
  return {
    ...item,
    id: item?.id || '',
    userId: item?.userId || '',
    type: item?.type || '',
    amountDelta: item?.amountDelta ?? 0,
    beforeBalance: item?.beforeBalance ?? 0,
    afterBalance: item?.afterBalance ?? 0,
    currency: item?.currency || 'CNY',
    sourceType: item?.sourceType || '',
    sourceId: item?.sourceId || '',
    idempotencyKey: item?.idempotencyKey || '',
    metadata: item?.metadata || {},
    createdAt: item?.createdAt || '',
    updatedAt: item?.updatedAt || item?.createdAt || '',
  };
}

function serializeRechargeOrder(order) {
  const paymentPayload = order?.paymentPayload || order?.payment_payload || {};
  return {
    ...order,
    orderId: order?.orderId || order?.id || '',
    order_id: order?.order_id || order?.id || '',
    outTradeNo: order?.outTradeNo || order?.out_trade_no || '',
    out_trade_no: order?.out_trade_no || order?.outTradeNo || '',
    channel: order?.channel || order?.method || '',
    method: order?.method || order?.channel || '',
    paymentPayload,
    payment_payload: paymentPayload,
    payment: paymentPayload,
    gatewayPayload: paymentPayload,
    gateway_payload: paymentPayload,
    payType:
      paymentPayload?.payType || paymentPayload?.pay_type || paymentPayload?.type || order?.paymentType || '',
    pay_type:
      paymentPayload?.pay_type || paymentPayload?.payType || paymentPayload?.type || order?.paymentType || '',
    payInfo:
      paymentPayload?.payInfo ||
      paymentPayload?.pay_info ||
      paymentPayload?.paymentUrl ||
      paymentPayload?.qrCode ||
      '',
    pay_info:
      paymentPayload?.pay_info ||
      paymentPayload?.payInfo ||
      paymentPayload?.paymentUrl ||
      paymentPayload?.qrCode ||
      '',
    paymentUrl: paymentPayload?.paymentUrl || paymentPayload?.url || '',
    payment_url: paymentPayload?.paymentUrl || paymentPayload?.url || '',
    qrCode: paymentPayload?.qrCode || paymentPayload?.qr_code || '',
    qr_code: paymentPayload?.qr_code || paymentPayload?.qrCode || '',
  };
}

function serializeManagedUser(item) {
  const account = item?.account || null;
  return {
    id: item?.id || '',
    email: item?.email || '',
    status: item?.status || '',
    createdAt: item?.createdAt || '',
    updatedAt: item?.updatedAt || '',
    lastLoginAt: item?.lastLoginAt || '',
    account: account
      ? {
          id: account.id,
          balance: account.balance,
          currency: account.currency,
          updatedAt: account.updatedAt || '',
        }
      : null,
    balance: account?.balance ?? null,
    currency: account?.currency || '',
  };
}

function serializeManagedUserDetail(result) {
  return withDataAliases({
    user: serializeManagedUser({
      ...result?.user,
      account: result?.account || null,
    }),
    account: result?.account || null,
    stats: result?.stats || {},
  });
}

function serializeCollectionResponse(result, itemSerializer = (item) => item) {
  const items = Array.isArray(result?.items) ? result.items.map(itemSerializer) : [];
  const page = result?.page || {
    offset: 0,
    limit: items.length,
    total: items.length,
    hasMore: false,
  };

  return withDataAliases(
    {
      items,
      page,
      total: page.total ?? items.length,
      count: items.length,
      list: items,
    },
    {
      totalCount: page.total ?? items.length,
    },
  );
}

function serializeImageGenerationResponse(result) {
  const data = Array.isArray(result?.data) ? result.data.map(normalizeImageItem) : [];
  const history = result?.history ? serializeImageHistoryEntry(result.history) : null;

  return withDataAliases(
    {
      ...result,
      data,
      images: data,
      history,
      historyId: history?.id || '',
      history_id: history?.id || '',
      sessionId: history?.sessionId || result?.sessionId || '',
      session_id: history?.sessionId || result?.sessionId || '',
      referenceApplied: Boolean(result?.referenceApplied ?? result?.reference_applied),
      reference_applied: Boolean(result?.reference_applied ?? result?.referenceApplied),
      referenceImageApplied: Boolean(
        result?.referenceImageApplied ?? result?.referenceApplied ?? result?.reference_applied,
      ),
      referenceDowngraded: Boolean(result?.referenceDowngraded ?? result?.reference_downgraded),
      reference_downgraded: Boolean(result?.reference_downgraded ?? result?.referenceDowngraded),
      referenceImageDowngraded: Boolean(
        result?.referenceImageDowngraded ?? result?.referenceDowngraded ?? result?.reference_downgraded,
      ),
      referenceDowngradeReason:
        result?.referenceDowngradeReason || result?.reference_downgrade_reason || '',
      reference_downgrade_reason:
        result?.reference_downgrade_reason || result?.referenceDowngradeReason || '',
      referenceImageDowngradeReason:
        result?.referenceImageDowngradeReason ||
        result?.referenceDowngradeReason ||
        result?.reference_downgrade_reason ||
        '',
      estimatedCharge: result?.estimatedCharge ?? 0,
      chargedAmount: result?.chargedAmount ?? 0,
      currency: result?.currency || 'CNY',
      billingStatus: result?.billingStatus || '',
      billingEventId: result?.billingEventId || '',
    },
    {
      items: data,
    },
  );
}

function parsePositiveInt(value, fallback, fieldName) {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw badRequest(`Query "${fieldName}" must be a non-negative integer`);
  }
  return parsed;
}

function requireSessionId(searchParams) {
  const sessionId = searchParams.get('sessionId');
  if (!sessionId || !sessionId.trim()) {
    throw badRequest('Query "sessionId" is required');
  }
  return sessionId.trim();
}

function paginate(items, searchParams) {
  const offset = parsePositiveInt(searchParams.get('offset'), 0, 'offset');
  const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 20, 'limit') || 20, 100);
  const pagedItems = items.slice(offset, offset + limit);

  return {
    items: pagedItems,
    page: {
      offset,
      limit,
      total: items.length,
      hasMore: offset + limit < items.length,
    },
  };
}

function sortByUpdatedAtDesc(items) {
  return [...items].sort((left, right) => {
    const leftValue = left.updatedAt || left.createdAt || '';
    const rightValue = right.updatedAt || right.createdAt || '';
    return rightValue.localeCompare(leftValue);
  });
}

function parseAdminUserRoute(pathname) {
  const prefix = '/api/admin/users/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const suffix = pathname.slice(prefix.length);
  if (!suffix) {
    return null;
  }

  const parts = suffix.split('/').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  return {
    userId: parts[0],
    action: parts.slice(1).join('/'),
  };
}

async function listOrders(store, searchParams, userId) {
  let items = await store.listOrdersByUserId(userId);
  const status = searchParams.get('status');
  const channel = searchParams.get('channel');

  if (status) {
    items = items.filter((item) => item.status === status);
  }
  if (channel) {
    items = items.filter((item) => item.channel === channel);
  }

  items = sortByUpdatedAtDesc(items);
  return paginate(items, searchParams);
}

async function listVideoTasks(store, searchParams, userId) {
  let items = await store.listVideoTasksByUserId(userId);
  const status = searchParams.get('status');
  const sessionId = searchParams.get('sessionId');
  const model = searchParams.get('model');

  if (status) {
    items = items.filter((item) => item.status === status);
  }
  if (sessionId) {
    items = items.filter((item) => item.sessionId === sessionId);
  }
  if (model) {
    items = items.filter((item) => item.model === model);
  }

  items = sortByUpdatedAtDesc(items);
  return paginate(items, searchParams);
}

async function listImageHistory(store, searchParams, userId) {
  let items = await store.listImageHistoryByUserId(userId);
  const model = searchParams.get('model');
  const sessionId = searchParams.get('sessionId');

  if (model) {
    items = items.filter((item) => item.model === model);
  }
  if (sessionId) {
    items = items.filter((item) => item.sessionId === sessionId);
  }

  items = sortByUpdatedAtDesc(items);
  return paginate(items, searchParams);
}

function getRateLimitOptions(config, pathname) {
  if (pathname === '/api/images/generations') {
    return {
      bucket: 'images',
      limit: config.rateLimit.imageRequests,
      windowMs: config.rateLimit.windowMs,
    };
  }

  if (pathname === '/api/videos/generations') {
    return {
      bucket: 'videos',
      limit: config.rateLimit.videoRequests,
      windowMs: config.rateLimit.windowMs,
    };
  }

  return null;
}

function applyRateLimit(deps, req, pathname, context) {
  const options = getRateLimitOptions(deps.config, pathname);
  if (!options) {
    return {};
  }

  const result = deps.rateLimiter.check(`${options.bucket}:${context.ip}`, options);
  const headers = {
    'x-ratelimit-limit': String(options.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.allowed) {
    deps.logger.warn('rate_limit.exceeded', {
      requestId: context.requestId,
      method: req.method,
      path: pathname,
      ip: context.ip,
      limit: options.limit,
      windowMs: options.windowMs,
    });
    throw new AppError(429, 'Rate limit exceeded', {
      retryAfterMs: result.retryAfterMs,
      limit: options.limit,
      windowMs: options.windowMs,
    });
  }

  return headers;
}

export async function handleApiRequest(deps, req, url, context) {
  const { config, store } = deps;
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    return json({
      ok: true,
      env: config.env,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === 'GET' && pathname === '/api/config') {
    return json(serializeConfig(config));
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    return json(await getMe(deps, req));
  }

  if (req.method === 'POST' && pathname === '/api/auth/email/request-code') {
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    return json(await requestEmailLoginCode(deps, payload, context), 200);
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const result = await registerWithPassword(deps, req, payload, context);
    return json(result, 201);
  }

  if (req.method === 'POST' && pathname === '/api/auth/register/verify') {
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    return json(await verifyRegistrationCode(deps, payload, context), 200);
  }

  if (req.method === 'POST' && pathname === '/api/auth/password/login') {
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const result = await loginWithPassword(deps, req, payload, context);
    return json(result.payload, 200, {
      'set-cookie': result.cookie,
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/email/verify-code') {
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const result = await verifyEmailLoginCode(deps, req, payload, context);
    return json(result.payload, 200, {
      'set-cookie': result.cookie,
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const result = await logout(deps, req, context);
    return json(result.payload, 200, {
      'set-cookie': result.cookie,
    });
  }

  if (pathname === '/api/admin/users') {
    const { admin } = await requireAdminSession(deps, req);
    if (req.method === 'GET') {
      return json(
        serializeCollectionResponse(
          paginate(await listManagedUsers(store), url.searchParams),
          serializeManagedUser,
        ),
      );
    }
    if (req.method === 'POST') {
      await requireAdminSession(deps, req, { allowedRoles: ['super_admin'] });
      const payload = await readJsonBody(req, config.bodyLimitBytes);
      const result = await createManagedUser(deps, admin, payload);
      return json(serializeManagedUserDetail({ ...result, stats: {} }), 201);
    }
  }

  const adminUserRoute = parseAdminUserRoute(pathname);
  if (adminUserRoute) {
    const { admin } = await requireAdminSession(deps, req);
    const { userId, action } = adminUserRoute;

    if (req.method === 'GET' && action === '') {
      return json(serializeManagedUserDetail(await getManagedUserById(store, userId)));
    }

    if (req.method === 'POST' && action === 'disable') {
      await requireAdminSession(deps, req, { allowedRoles: ['super_admin'] });
      const user = await setManagedUserStatus(deps, admin, userId, 'disabled');
      const detail = await getManagedUserById(store, user.id);
      return json(serializeManagedUserDetail(detail), 200);
    }

    if (req.method === 'POST' && action === 'enable') {
      await requireAdminSession(deps, req, { allowedRoles: ['super_admin'] });
      const user = await setManagedUserStatus(deps, admin, userId, 'active');
      const detail = await getManagedUserById(store, user.id);
      return json(serializeManagedUserDetail(detail), 200);
    }

    if (req.method === 'GET' && action === 'orders') {
      return json(
        serializeCollectionResponse(
          paginate(await listManagedUserOrders(store, userId), url.searchParams),
          serializeRechargeOrder,
        ),
      );
    }

    if (req.method === 'POST' && action === 'balance-adjustments') {
      await requireAdminSession(deps, req, { allowedRoles: ['super_admin'] });
      const payload = await readJsonBody(req, config.bodyLimitBytes);
      const result = await createBalanceAdjustment(deps, admin, userId, payload);
      return json(withDataAliases(result), 200);
    }
  }

  if (req.method === 'GET' && pathname === '/api/account') {
    const { user } = await requireUserSession(deps, req);
    const account = await store.getAccountByUserId(user.id);
    const orders = await store.listOrdersByUserId(user.id);
    const tasks = await store.listVideoTasksByUserId(user.id);
    const imageHistory = await store.listImageHistoryByUserId(user.id);
    return json(
      serializeAccountPayload(account, {
        orderCount: orders.length,
        pendingOrderCount: orders.filter((item) => item.status === 'pending').length,
        videoTaskCount: tasks.length,
        imageHistoryCount: imageHistory.length,
      }),
    );
  }

  if (req.method === 'GET' && pathname === '/api/images/history') {
    const { user } = await requireUserSession(deps, req);
    return json(
      serializeCollectionResponse(
        await listImageHistory(store, url.searchParams, user.id),
        serializeImageHistoryEntry,
      ),
    );
  }

  if (req.method === 'DELETE' && pathname === '/api/images/history') {
    const { user } = await requireUserSession(deps, req);
    const sessionId = requireSessionId(url.searchParams);
    return json(await store.deleteImageHistoryBySessionIdForUser(sessionId, user.id), 200);
  }

  if (req.method === 'GET' && pathname === '/api/recharge/orders') {
    const { user } = await requireUserSession(deps, req);
    return json(
      serializeCollectionResponse(await listOrders(store, url.searchParams, user.id), serializeRechargeOrder),
    );
  }

  if (req.method === 'GET' && pathname === '/api/billing/events') {
    const { user } = await requireUserSession(deps, req);
    const items = sortByUpdatedAtDesc(await store.listBillingEventsByUserId(user.id));
    return json(serializeCollectionResponse(paginate(items, url.searchParams), serializeBillingEvent));
  }

  if (req.method === 'POST' && pathname === '/api/recharge/orders') {
    const { user } = await requireUserSession(deps, req);
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const order = await createRechargeOrder({ ...deps, context: { ...context, userId: user.id } }, payload);
    return json(withDataAliases(serializeRechargeOrder(order)), 201);
  }

  if (req.method === 'GET' && pathname === '/api/videos/tasks') {
    const { user } = await requireUserSession(deps, req);
    return json(
      serializeCollectionResponse(await listVideoTasks(store, url.searchParams, user.id), serializeVideoTask),
    );
  }

  if (req.method === 'GET' && pathname === '/api/videos/history') {
    const { user } = await requireUserSession(deps, req);
    return json(
      serializeCollectionResponse(await listVideoTasks(store, url.searchParams, user.id), serializeVideoTask),
    );
  }

  if (req.method === 'DELETE' && pathname === '/api/videos/history') {
    const { user } = await requireUserSession(deps, req);
    const sessionId = requireSessionId(url.searchParams);
    return json(await store.deleteVideoTasksBySessionIdForUser(sessionId, user.id), 200);
  }

  if (req.method === 'POST' && pathname === '/api/images/generations') {
    const { user } = await requireUserSession(deps, req);
    const rateLimitHeaders = applyRateLimit(deps, req, pathname, context);
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const data = await createImageGeneration({ ...deps, context: { ...context, userId: user.id } }, payload);
    return json(serializeImageGenerationResponse(data), 200, rateLimitHeaders);
  }

  if (req.method === 'POST' && pathname === '/api/videos/generations') {
    const { user } = await requireUserSession(deps, req);
    const rateLimitHeaders = applyRateLimit(deps, req, pathname, context);
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const task = await createVideoTask({ ...deps, context: { ...context, userId: user.id } }, payload);
    return json(withDataAliases(serializeVideoTask(task)), 201, rateLimitHeaders);
  }

  if (req.method === 'POST' && pathname === '/api/videos/tasks/callback') {
    const payload = await readJsonBody(req, config.bodyLimitBytes);
    const task = await applyVideoCallback(store, payload);
    return json(withDataAliases(serializeVideoTask(task)), 200);
  }

  if (req.method === 'GET' && pathname.startsWith('/api/videos/tasks/')) {
    const { user } = await requireUserSession(deps, req);
    const taskId = pathname.slice('/api/videos/tasks/'.length);
    if (!taskId) {
      throw notFound('Task id is required');
    }
    const task = await getVideoTask({ ...deps, context: { ...context, userId: user.id } }, taskId);
    return json(withDataAliases(serializeVideoTask(task)), 200);
  }

  if (req.method === 'GET' && pathname === '/api/payments/junliai/notify') {
    const result = await handleJunliaiNotify({ ...deps, context }, url.searchParams);
    return text('success', 200, {
      'x-order-id': result.order.id,
      'x-order-duplicate': String(result.duplicate),
    });
  }

  throw notFound('API route not found');
}
