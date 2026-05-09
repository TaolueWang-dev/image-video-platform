import crypto from 'node:crypto';

import { badRequest, notFound, upstreamError } from '../errors.js';
import {
  buildNotifyUrl,
  nowIso,
  randomId,
  requireObject,
  requirePositiveInteger,
  requireString,
} from '../utils.js';

function signRsaSha256(privateKey, content) {
  return crypto.sign('RSA-SHA256', Buffer.from(content, 'utf8'), privateKey).toString('base64');
}

function verifyRsaSha256(publicKey, content, signature) {
  return crypto.verify(
    'RSA-SHA256',
    Buffer.from(content, 'utf8'),
    publicKey,
    Buffer.from(signature, 'base64'),
  );
}

function stableSortObject(data) {
  return Object.entries(data)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .filter(([, value]) => typeof value !== 'object')
    .sort(([left], [right]) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

function buildJunliaiSigningContent(data) {
  const signPayload = { ...data };
  delete signPayload.sign;
  delete signPayload.sign_type;

  return stableSortObject(signPayload)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function requireObjectOrEmpty(value) {
  if (value === undefined) {
    return {};
  }
  requireObject(value, 'Field "metadata" must be an object');
  return value;
}

function normalizeRechargeChannel(value) {
  const channel = requireString(value, 'channel').toLowerCase();
  if (channel === 'wechat' || channel === 'wxpay') {
    return {
      channel: 'wechat',
      type: 'wxpay',
    };
  }
  if (channel === 'alipay') {
    return {
      channel: 'alipay',
      type: 'alipay',
    };
  }
  throw badRequest('Field "channel" must be "wechat", "wxpay", or "alipay"');
}

function normalizeJunliaiType(value) {
  if (!value) {
    return '';
  }
  const lower = String(value).trim().toLowerCase();
  return lower === 'wxpay' ? 'wechat' : lower;
}

function buildJunliaiEventKey(payload) {
  return payload.trade_no || payload.api_trade_no || `${payload.out_trade_no}:${payload.trade_status || payload.status || 'paid'}`;
}

async function markOrderPaid(store, order, notifyPayload, paymentEvent) {
  const paidAt = nowIso();
  const result = await store.completeOrderPayment({
    orderId: order.id,
    eventKey: paymentEvent.eventKey,
    provider: paymentEvent.provider,
    providerTradeNo: paymentEvent.providerTradeNo,
    notifyPayload,
    paidAt,
  });

  if (!result.order) {
    throw notFound(`Unknown order: ${order.id}`);
  }

  return {
    order: result.order,
    duplicate: result.duplicate || !result.applied,
    paymentEvent: result.paymentEvent,
  };
}

function hasJunliaiLiveConfig(config) {
  return Boolean(
    config.payments.junliai.pid &&
      config.payments.junliai.privateKey &&
      config.payments.junliai.publicKey,
  );
}

function assertJunliaiLiveConfig(config) {
  if (!hasJunliaiLiveConfig(config)) {
    throw badRequest(
      'JUNLIAI_PAY_PID, JUNLIAI_PAY_PRIVATE_KEY, and JUNLIAI_PAY_PLATFORM_PUBLIC_KEY are required for live Junliai payments',
    );
  }
}

function verifyJunliaiSignature(publicKey, payload) {
  const signature = payload.sign;
  const signType = payload.sign_type || 'RSA';

  if (!signature) {
    throw badRequest('Missing Junliai signature');
  }
  if (signType !== 'RSA') {
    throw badRequest(`Unsupported Junliai sign_type: ${signType}`);
  }
  if (!publicKey) {
    throw badRequest('JUNLIAI_PAY_PLATFORM_PUBLIC_KEY is required to verify Junliai signatures');
  }

  const content = buildJunliaiSigningContent(payload);
  const verified = verifyRsaSha256(publicKey, content, signature);
  if (!verified) {
    throw badRequest('Invalid Junliai signature');
  }

  return {
    verified: true,
    signingContent: content,
  };
}

function parseProviderPayload(payType, payInfo) {
  if (
    typeof payInfo === 'string' &&
    payInfo &&
    ['jsapi', 'app', 'scan', 'wxplugin', 'wxapp'].includes(payType)
  ) {
    try {
      return JSON.parse(payInfo);
    } catch {
      return payInfo;
    }
  }
  return payInfo;
}

function mapPaymentPresentation(payType, payInfo) {
  const providerPayload = parseProviderPayload(payType, payInfo);
  const result = {
    payType,
    payInfo,
    providerPayload,
  };

  if (payType === 'jump' && typeof payInfo === 'string') {
    result.paymentUrl = payInfo;
  }
  if (payType === 'qrcode' && typeof payInfo === 'string') {
    result.qrCode = payInfo;
  }
  if (payType === 'html' && typeof payInfo === 'string') {
    result.html = payInfo;
  }

  return result;
}

function buildJunliaiCreateRequest(config, order, payload, context) {
  const junliai = config.payments.junliai;
  const notifyUrl =
    junliai.notifyUrl ||
    buildNotifyUrl(config.seedDance.callbackBaseUrl, '/api/payments/junliai/notify');
  const returnUrl = junliai.returnUrl || '';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestedMethod = typeof payload.method === 'string' ? payload.method.trim().toLowerCase() : '';
  const method = ['web', 'jump', 'jsapi', 'app', 'scan', 'applet'].includes(requestedMethod)
    ? requestedMethod
    : junliai.method || 'web';
  const device = payload.device?.trim() || junliai.device || 'pc';
  const requestBody = {
    pid: junliai.pid,
    method,
    type: order.paymentType,
    out_trade_no: order.outTradeNo,
    notify_url: requireString(notifyUrl, 'notify_url'),
    name: order.subject,
    money: (order.amount / 100).toFixed(2),
    clientip: requireString(context.ip || '127.0.0.1', 'clientip'),
    timestamp,
    sign_type: junliai.signType || 'RSA',
  };

  if (returnUrl) {
    requestBody.return_url = returnUrl;
  }
  if (method === 'web') {
    requestBody.device = device;
  }

  const param = JSON.stringify({
    orderId: order.id,
    channel: order.channel,
    metadata: order.metadata,
  });
  if (param !== '{}') {
    requestBody.param = param;
  }

  const signingContent = buildJunliaiSigningContent(requestBody);
  return {
    gateway: junliai.gateway,
    path: junliai.createPath,
    requestBody,
    signingContent,
  };
}

async function callJunliaiApi({ gateway, path, body }) {
  const response = await fetch(`${gateway}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });

  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw upstreamError('Junliai gateway returned invalid JSON', {
      status: response.status,
      body: raw,
      cause: error.message,
    });
  }

  if (!response.ok) {
    throw upstreamError('Junliai gateway request failed', {
      status: response.status,
      body: parsed,
    });
  }

  return parsed;
}

async function createJunliaiOrder(config, order, payload, context) {
  const request = buildJunliaiCreateRequest(config, order, payload, context);
  if (!hasJunliaiLiveConfig(config)) {
    return {
      integrationMode: 'skeleton',
      provider: 'junliai',
      gateway: `${request.gateway}${request.path}`,
      method: request.requestBody.method,
      type: order.paymentType,
      requestBody: request.requestBody,
      verified: false,
      ...mapPaymentPresentation('', ''),
    };
  }

  const signedBody = {
    ...request.requestBody,
    sign: signRsaSha256(config.payments.junliai.privateKey, request.signingContent),
  };

  const responseBody = await callJunliaiApi({
    gateway: request.gateway,
    path: request.path,
    body: signedBody,
  });

  if (Number(responseBody.code) !== 0) {
    throw badRequest(responseBody.msg || 'Junliai order creation failed', {
      body: responseBody,
    });
  }
  const verification = verifyJunliaiSignature(config.payments.junliai.publicKey, responseBody);

  return {
    integrationMode: 'live',
    provider: 'junliai',
    gateway: `${request.gateway}${request.path}`,
    method: request.requestBody.method,
    type: order.paymentType,
    requestBody: request.requestBody,
    providerResponse: responseBody,
    verified: verification.verified,
    ...mapPaymentPresentation(responseBody.pay_type || '', responseBody.pay_info || ''),
  };
}

async function findRechargeOrderForProviderResult(store, params) {
  const outTradeNo = params.out_trade_no || '';
  if (!outTradeNo) {
    throw badRequest('Junliai response is missing out_trade_no');
  }
  const order = await store.findOrderByTradeNo(outTradeNo);
  if (!order) {
    throw notFound(`Unknown order: ${outTradeNo}`);
  }
  return order;
}

async function applySuccessfulProviderPayment(store, order, params, verification) {
  return markOrderPaid(
    store,
    order,
    {
      params,
      verified: verification.verified,
    },
    {
      eventKey: buildJunliaiEventKey(params),
      provider: 'junliai',
      providerTradeNo: params.api_trade_no || params.trade_no || '',
    },
  );
}

function buildJunliaiQueryRequest(config, tradeNo, outTradeNo) {
  const junliai = config.payments.junliai;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestBody = {
    pid: junliai.pid,
    timestamp,
    sign_type: junliai.signType || 'RSA',
  };

  if (tradeNo) {
    requestBody.trade_no = tradeNo;
  }
  if (outTradeNo) {
    requestBody.out_trade_no = outTradeNo;
  }
  if (!requestBody.trade_no && !requestBody.out_trade_no) {
    throw badRequest('Either "tradeNo" or "outTradeNo" is required');
  }

  const signingContent = buildJunliaiSigningContent(requestBody);
  return {
    gateway: junliai.gateway,
    path: junliai.queryPath,
    requestBody,
    sign: signRsaSha256(junliai.privateKey, signingContent),
  };
}

export async function createRechargeOrder({ config, store, context }, payload) {
  requireObject(payload, 'Recharge order payload must be an object');

  const channelInfo = normalizeRechargeChannel(payload.channel);
  const amount = requirePositiveInteger(payload.amount, 'amount');
  const subject = payload.subject?.trim() || `Balance recharge ${amount / 100}`;
  const orderId = randomId('order');
  const outTradeNo = randomId('junliai');
  const createdAt = nowIso();

  const baseOrder = {
    id: orderId,
    userId: context.userId,
    outTradeNo,
    channel: channelInfo.channel,
    amount,
    currency: config.defaults.currency,
    subject,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
    metadata: requireObjectOrEmpty(payload.metadata),
    paymentProvider: 'junliai',
    paymentType: channelInfo.type,
  };

  const paymentPayload = await createJunliaiOrder(config, baseOrder, payload, context || {});
  const order = {
    ...baseOrder,
    orderId: orderId,
    order_id: orderId,
    out_trade_no: outTradeNo,
    method: channelInfo.channel,
    paymentType: channelInfo.type,
    payType: paymentPayload?.payType || paymentPayload?.pay_type || paymentPayload?.type || channelInfo.type,
    pay_type: paymentPayload?.pay_type || paymentPayload?.payType || paymentPayload?.type || channelInfo.type,
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
    paymentPayload,
    payment_payload: paymentPayload,
    payment: paymentPayload,
  };
  await store.upsertOrder(order);

  return order;
}

export async function queryRechargeOrder({ config, store }, { tradeNo = '', outTradeNo = '' }) {
  assertJunliaiLiveConfig(config);

  const request = buildJunliaiQueryRequest(config, tradeNo, outTradeNo);
  const responseBody = await callJunliaiApi({
    gateway: request.gateway,
    path: request.path,
    body: {
      ...request.requestBody,
      sign: request.sign,
    },
  });

  if (Number(responseBody.code) !== 0) {
    throw badRequest(responseBody.msg || 'Junliai order query failed', {
      body: responseBody,
    });
  }
  const verification = verifyJunliaiSignature(config.payments.junliai.publicKey, responseBody);

  const order = await findRechargeOrderForProviderResult(store, responseBody);
  let payment = null;
  if (String(responseBody.status) === '1') {
    payment = await applySuccessfulProviderPayment(store, order, responseBody, verification);
  }

  return {
    order: payment?.order || order,
    duplicate: payment?.duplicate || false,
    paid: String(responseBody.status) === '1',
    providerResponse: responseBody,
    verified: verification.verified,
  };
}

export async function handleJunliaiNotify({ config, store }, params) {
  assertJunliaiLiveConfig(config);
  const payload = Object.fromEntries(params.entries());
  const verification = verifyJunliaiSignature(config.payments.junliai.publicKey, payload);

  if (payload.trade_status !== 'TRADE_SUCCESS') {
    throw badRequest(`Unexpected Junliai trade_status: ${payload.trade_status || ''}`);
  }

  const order = await findRechargeOrderForProviderResult(store, payload);
  const paidOrder = await applySuccessfulProviderPayment(store, order, payload, verification);

  return {
    duplicate: paidOrder.duplicate,
    order: paidOrder.order,
  };
}
