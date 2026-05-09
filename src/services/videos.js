import { badRequest, notFound } from '../errors.js';
import { requestJson } from '../http-client.js';
import { applyUsageCharge, calculateVideoCharge, ensureSufficientBalance } from './billing.js';
import { nowIso, randomId, requireObject, requireString } from '../utils.js';

const VIDEO_ATTACHMENT_ROLE_SET = new Set(['first_frame', 'last_frame', 'reference_image']);
const VIDEO_ATTACHMENT_FIELD_CANDIDATES = ['attachments', 'inputAttachments', 'imageAttachments'];
const VIDEO_ATTACHMENT_URL_FIELD_CANDIDATES = ['url', 'image_url', 'dataUrl', 'data_url', 'src'];

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function extractVideoAssetUrls(remoteData) {
  const remoteContent = remoteData?.content && typeof remoteData.content === 'object' ? remoteData.content : {};
  const output = remoteData?.output && typeof remoteData.output === 'object' ? remoteData.output : {};
  const result = remoteData?.result && typeof remoteData.result === 'object' ? remoteData.result : {};
  const outputs = Array.isArray(remoteData?.outputs) ? remoteData.outputs : [];
  const firstOutput = outputs.find((item) => item && typeof item === 'object') || {};

  return {
    videoUrl: firstNonEmptyString(
      remoteData?.video_url,
      remoteContent?.video_url,
      output?.video_url,
      result?.video_url,
      firstOutput?.video_url,
      firstOutput?.url,
    ),
    outputUrl: firstNonEmptyString(
      remoteData?.output_url,
      remoteContent?.output_url,
      output?.output_url,
      result?.output_url,
      firstOutput?.output_url,
    ),
    resultUrl: firstNonEmptyString(
      remoteData?.result_url,
      remoteContent?.result_url,
      output?.result_url,
      result?.result_url,
      firstOutput?.result_url,
    ),
  };
}

function extractRequestAttachments(requestPayload, currentTask) {
  const requestContent = Array.isArray(requestPayload?.content) ? requestPayload.content : [];
  const attachments = requestContent
    .filter((item) => item?.type === 'image_url')
    .map((item, index) => ({
      index,
      role: item?.role || 'reference_image',
      name: `图片 ${index + 1}`,
      url:
        (typeof item?.image_url?.url === 'string' && item.image_url.url) ||
        (typeof item?.image_url === 'string' && item.image_url) ||
        '',
    }))
    .filter((item) => item.url);

  if (attachments.length > 0) {
    return attachments;
  }

  return Array.isArray(currentTask?.attachments) ? currentTask.attachments : [];
}

function extractVideoPrompt(payload, upstreamPayload) {
  if (typeof payload.prompt === 'string' && payload.prompt.trim() !== '') {
    return payload.prompt.trim();
  }

  const content = Array.isArray(upstreamPayload.content) ? upstreamPayload.content : [];
  const textItem = content.find(
    (item) => item && item.type === 'text' && typeof item.text === 'string' && item.text.trim() !== '',
  );
  return textItem ? textItem.text.trim() : '';
}

function buildVideoRecord(payload, upstreamPayload, remoteData, currentTask) {
  const timestamp = nowIso();
  const status = remoteData?.status || currentTask?.status || 'queued';
  const sessionId =
    typeof payload?.sessionId === 'string' && payload.sessionId.trim() !== ''
      ? payload.sessionId.trim()
      : currentTask?.sessionId || randomId('video_session');
  const requestPayload = upstreamPayload || currentTask?.request || {};
  const { videoUrl, outputUrl, resultUrl } = extractVideoAssetUrls(remoteData);
  const progress = remoteData?.progress ?? currentTask?.progress ?? '';
  const error = firstNonEmptyString(remoteData?.error, remoteData?.err_msg, currentTask?.error);
  const message = firstNonEmptyString(remoteData?.message, remoteData?.msg, currentTask?.message);
  const prompt = extractVideoPrompt(payload || {}, requestPayload);
  const model = requestPayload?.model || currentTask?.model || '';
  const duration = remoteData?.duration ?? requestPayload?.duration ?? currentTask?.duration ?? '';
  const resolution = firstNonEmptyString(
    remoteData?.resolution,
    requestPayload?.resolution,
    currentTask?.resolution,
  );
  const ratio = firstNonEmptyString(remoteData?.ratio, requestPayload?.ratio, currentTask?.ratio);
  const attachments = extractRequestAttachments(requestPayload, currentTask);

  return {
    id: remoteData?.id || currentTask?.id || '',
    userId: currentTask?.userId || payload?.userId || '',
    taskId: remoteData?.id || currentTask?.taskId || currentTask?.id || '',
    task_id: remoteData?.id || currentTask?.taskId || currentTask?.id || '',
    sessionId,
    session_id: sessionId,
    parentId:
      typeof payload?.parentId === 'string' && payload.parentId.trim() !== ''
        ? payload.parentId.trim()
        : currentTask?.parentId || '',
    parent_id:
      typeof payload?.parentId === 'string' && payload.parentId.trim() !== ''
        ? payload.parentId.trim()
        : currentTask?.parentId || '',
    kind: typeof payload?.kind === 'string' && payload.kind.trim() !== '' ? payload.kind.trim() : 'generation',
    prompt,
    model,
    status,
    duration,
    resolution,
    ratio,
    progress,
    attachments,
    videoUrl,
    video_url: videoUrl,
    outputUrl,
    output_url: outputUrl,
    resultUrl,
    result_url: resultUrl,
    estimatedCharge:
      payload?.estimatedCharge ??
      currentTask?.estimatedCharge ??
      remoteData?.estimatedCharge ??
      0,
    chargedAmount:
      payload?.chargedAmount ??
      currentTask?.chargedAmount ??
      remoteData?.chargedAmount ??
      0,
    currency: payload?.currency || currentTask?.currency || 'CNY',
    billingStatus:
      payload?.billingStatus ||
      currentTask?.billingStatus ||
      remoteData?.billingStatus ||
      'pending',
    billingEventId:
      payload?.billingEventId ||
      currentTask?.billingEventId ||
      remoteData?.billingEventId ||
      '',
    error,
    message,
    request: requestPayload || null,
    remote: remoteData,
    createdAt: currentTask?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function isValidVideoAttachmentUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  );
}

function readVideoAttachmentUrl(attachment, fieldPath) {
  const nestedImageUrl = attachment?.image_url;
  if (
    nestedImageUrl &&
    typeof nestedImageUrl === 'object' &&
    typeof nestedImageUrl.url === 'string' &&
    nestedImageUrl.url.trim() !== ''
  ) {
    const value = nestedImageUrl.url.trim();
    if (!isValidVideoAttachmentUrl(value)) {
      throw badRequest(`Field "${fieldPath}.image_url.url" must be a data URL or an http(s) URL`);
    }
    return value;
  }

  for (const fieldName of VIDEO_ATTACHMENT_URL_FIELD_CANDIDATES) {
    if (typeof attachment[fieldName] === 'string' && attachment[fieldName].trim() !== '') {
      const value = attachment[fieldName].trim();
      if (!isValidVideoAttachmentUrl(value)) {
        throw badRequest(
          `Field "${fieldPath}.${fieldName}" must be a data URL or an http(s) URL`,
        );
      }
      return value;
    }
  }

  throw badRequest(
    `Field "${fieldPath}" must include one of ${VIDEO_ATTACHMENT_URL_FIELD_CANDIDATES.map((name) => `"${name}"`).join(', ')}`,
  );
}

function normalizeVideoAttachments(payload) {
  const attachmentFieldName = VIDEO_ATTACHMENT_FIELD_CANDIDATES.find((fieldName) => payload[fieldName] !== undefined);
  if (!attachmentFieldName) {
    return [];
  }

  const attachments = payload[attachmentFieldName];
  if (!Array.isArray(attachments)) {
    throw badRequest(`Field "${attachmentFieldName}" must be an array`);
  }

  return attachments.map((attachment, index) => {
    const fieldPath = `${attachmentFieldName}[${index}]`;
    requireObject(attachment, `Field "${fieldPath}" must be an object`);

    const role = requireString(attachment.role, `${fieldPath}.role`);
    if (!VIDEO_ATTACHMENT_ROLE_SET.has(role)) {
      throw badRequest(
        `Field "${fieldPath}.role" must be one of "first_frame", "last_frame", "reference_image"`,
      );
    }

    return {
      type: 'image_url',
      role,
      image_url: {
        url: readVideoAttachmentUrl(attachment, fieldPath),
      },
    };
  });
}

function normalizeExistingVideoContent(content) {
  if (!Array.isArray(content)) {
    throw badRequest('Field "content" must be an array');
  }

  return content.map((item, index) => {
    const fieldPath = `content[${index}]`;
    requireObject(item, `Field "${fieldPath}" must be an object`);

    if (item.type === 'text') {
      if (typeof item.text !== 'string' || item.text.trim() === '') {
        throw badRequest(`Field "${fieldPath}.text" must be a non-empty string`);
      }
      return {
        ...item,
        text: item.text.trim(),
      };
    }

    if (item.type === 'image_url') {
      const role = requireString(item.role, `${fieldPath}.role`);
      if (!VIDEO_ATTACHMENT_ROLE_SET.has(role)) {
        throw badRequest(
          `Field "${fieldPath}.role" must be one of "first_frame", "last_frame", "reference_image"`,
        );
      }

      const imageUrl = readVideoAttachmentUrl(item, fieldPath);
      return {
        ...item,
        role,
        image_url: {
          url: imageUrl,
        },
      };
    }

    throw badRequest(`Field "${fieldPath}.type" must be "text" or "image_url"`);
  });
}

function normalizeVideoPayload(config, payload, callbackUrl) {
  requireObject(payload, 'Video generation payload must be an object');
  const attachmentItems = normalizeVideoAttachments(payload);
  if (payload.content !== undefined && !Array.isArray(payload.content)) {
    throw badRequest('Field "content" must be an array');
  }

  if (Array.isArray(payload.content) && payload.content.length > 0) {
    const normalizedContent = normalizeExistingVideoContent(payload.content);
    return {
      ...payload,
      content: [...normalizedContent, ...attachmentItems],
      callback_url: payload.callback_url || callbackUrl,
    };
  }

  const content = [];
  if (typeof payload.prompt === 'string' && payload.prompt.trim() !== '') {
    content.push({
      type: 'text',
      text: payload.prompt.trim(),
    });
  }

  if (attachmentItems.length > 0) {
    content.push(...attachmentItems);
  }

  if (content.length === 0) {
    throw badRequest('Field "prompt" is required when no valid "content" or image attachments are provided');
  }

  return {
    model: payload.model || config.seedDance.defaultModel,
    content,
    resolution: payload.resolution || config.seedDance.defaultResolution,
    ratio: payload.ratio || payload.aspectRatio || config.seedDance.defaultRatio,
    duration: payload.duration || config.seedDance.defaultDuration,
    generate_audio:
      typeof payload.generate_audio === 'boolean'
        ? payload.generate_audio
        : config.seedDance.defaultGenerateAudio,
    callback_url: payload.callback_url || callbackUrl,
    watermark: Boolean(payload.watermark),
  };
}

export async function createVideoTask({ config, store, logger, context }, payload) {
  if (!config.seedDance.apiKey) {
    throw badRequest('SEEDDANCE_API_KEY or VOLCENGINE_API_KEY is not configured');
  }

  const callbackUrl = config.seedDance.callbackBaseUrl
    ? `${config.seedDance.callbackBaseUrl.replace(/\/$/, '')}/api/videos/tasks/callback`
    : '';

  const upstreamPayload = normalizeVideoPayload(config, payload, callbackUrl);
  const pricing = calculateVideoCharge(upstreamPayload, config.seedDance.defaultDuration);
  await ensureSufficientBalance(store, context.userId, pricing.amount, {
    operation: 'video_generation',
  });
  logger?.info('seeddance.create_task.model_selected', {
    requestId: context?.requestId,
    payloadModel: payload?.model || '',
    defaultModel: config.seedDance.defaultModel,
    effectiveModel: upstreamPayload.model || '',
  });

  const result = await requestJson({
    method: 'POST',
    baseUrl: config.seedDance.baseUrl,
    path: config.seedDance.createPath,
    timeoutMs: config.seedDance.timeoutMs,
    headers: {
      authorization: `Bearer ${config.seedDance.apiKey}`,
      'content-type': 'application/json',
    },
    body: upstreamPayload,
    logger,
    requestId: context?.requestId,
    operation: 'seeddance.create_task',
  });

  const taskId = result.data?.id;
  if (typeof taskId !== 'string' || taskId.trim() === '') {
    throw badRequest('SeedDance create response does not contain a valid task id', {
      upstream: result.data,
    });
  }

  const record = buildVideoRecord({
    ...payload,
    userId: context.userId,
    estimatedCharge: pricing.amount,
    chargedAmount: 0,
    billingStatus: 'pending',
    currency: pricing.currency,
  }, upstreamPayload, {
    ...result.data,
    id: taskId,
    status: result.data?.status || 'queued',
  });
  await store.upsertVideoTask(record);

  return record;
}

async function maybeChargeSuccessfulVideoTask(store, task) {
  const normalizedStatus = String(task.status || '').toLowerCase();
  if (!['succeeded', 'success', 'completed'].includes(normalizedStatus)) {
    return task;
  }
  if (task.billingStatus === 'charged' || task.billingStatus === 'failed') {
    return task;
  }

  try {
    const chargeResult = await applyUsageCharge(store, {
      userId: task.userId,
      amount: task.estimatedCharge || 0,
      type: 'video_charge',
      sourceType: 'video_task',
      sourceId: task.id || task.taskId || '',
      idempotencyKey: `video_charge:${task.id || task.taskId || ''}`,
      metadata: {
        model: task.model || '',
        durationSeconds: task.duration || 0,
      },
    });

    return {
      ...task,
      chargedAmount: task.estimatedCharge || 0,
      billingStatus: 'charged',
      billingEventId: chargeResult.billingEvent?.id || '',
      currency: task.currency || 'CNY',
    };
  } catch (error) {
    if (error?.details?.code !== 'balance_conflict') {
      throw error;
    }
    return {
      ...task,
      status: 'billing_failed',
      chargedAmount: 0,
      billingStatus: 'failed',
      error: 'Billing failed after task success',
      message: '余额在任务完成前发生变化，未能完成扣费。',
    };
  }
}

export async function getVideoTask({ config, store, logger, context }, taskId) {
  if (!config.seedDance.apiKey) {
    throw badRequest('SEEDDANCE_API_KEY or VOLCENGINE_API_KEY is not configured');
  }

  const localTask = await store.findVideoTaskByUserId(taskId, context.userId);
  if (!localTask) {
    throw notFound(`Unknown video task: ${taskId}`);
  }
  const path = config.seedDance.queryPathTemplate.replace('{taskId}', encodeURIComponent(taskId));
  const result = await requestJson({
    method: 'GET',
    baseUrl: config.seedDance.baseUrl,
    path,
    timeoutMs: config.seedDance.timeoutMs,
    headers: {
      authorization: `Bearer ${config.seedDance.apiKey}`,
      'content-type': 'application/json',
    },
    logger,
    requestId: context?.requestId,
    operation: 'seeddance.get_task',
  });

  const next = buildVideoRecord(localTask || {}, localTask?.request || null, {
    ...result.data,
    id: taskId,
  }, localTask);
  const billedTask = await maybeChargeSuccessfulVideoTask(store, next);
  await store.upsertVideoTask(billedTask);
  return billedTask;
}

export async function applyVideoCallback(store, payload) {
  requireObject(payload, 'Video callback payload must be an object');
  const taskId = requireString(payload.id || payload.task_id, 'id');
  const existing = await store.findVideoTask(taskId);
  if (!existing) {
    throw notFound(`Unknown video task: ${taskId}`);
  }

  const next = buildVideoRecord(existing, existing.request, payload, existing);
  const billedTask = await maybeChargeSuccessfulVideoTask(store, next);
  await store.upsertVideoTask(billedTask);
  return billedTask;
}
