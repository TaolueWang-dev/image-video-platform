import { badRequest } from '../errors.js';
import { requestJson } from '../http-client.js';
import { applyUsageCharge, calculateImageCharge, ensureSufficientBalance } from './billing.js';
import { nowIso, randomId, requireObject } from '../utils.js';

function extractPrompt(payload) {
  if (typeof payload.prompt === 'string' && payload.prompt.trim() !== '') {
    return payload.prompt.trim();
  }

  if (!Array.isArray(payload.input)) {
    return '';
  }

  for (const item of payload.input) {
    if (typeof item === 'string' && item.trim() !== '') {
      return item.trim();
    }

    if (item && typeof item === 'object') {
      if (typeof item.text === 'string' && item.text.trim() !== '') {
        return item.text.trim();
      }

      if (Array.isArray(item.content)) {
        const textContent = item.content.find(
          (contentItem) => contentItem && typeof contentItem.text === 'string' && contentItem.text.trim() !== '',
        );
        if (textContent) {
          return textContent.text.trim();
        }
      }
    }
  }

  return '';
}

function modelSupportsImageReference(model) {
  return typeof model === 'string' && model.startsWith('gpt-image');
}

function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }

  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    return null;
  }

  const header = parts[0] || '';
  const body = parts.slice(1).join(',');
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mimeType = mimeMatch?.[1] || 'image/png';
  const buffer = Buffer.from(body, 'base64');
  return new Blob([buffer], { type: mimeType });
}

function toDataUrlIfNeeded(imageValue) {
  if (typeof imageValue !== 'string') {
    return '';
  }

  const trimmed = imageValue.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Treat opaque base64 blobs as PNG data URLs.
  return `data:image/png;base64,${trimmed}`;
}

function normalizeReferenceImageValue(candidate) {
  if (typeof candidate === 'string') {
    const value = toDataUrlIfNeeded(candidate);
    return value ? { image_url: value, source: candidate } : null;
  }

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const directValue =
    (typeof candidate.image_url === 'string' && candidate.image_url.trim()) ||
    (typeof candidate.url === 'string' && candidate.url.trim()) ||
    (typeof candidate.b64_json === 'string' && candidate.b64_json.trim()) ||
    (typeof candidate.base64 === 'string' && candidate.base64.trim()) ||
    '';

  const normalized = toDataUrlIfNeeded(directValue);
  return normalized ? { image_url: normalized, source: directValue } : null;
}

function normalizeReferenceImage(payload) {
  const objectCandidate =
    (payload.reference_image && typeof payload.reference_image === 'object' && payload.reference_image) ||
    null;
  const arrayCandidate = Array.isArray(payload.referenceImages) ? payload.referenceImages[0] : null;
  const candidates = [
    objectCandidate,
    arrayCandidate,
    payload.referenceImageUrl,
    payload.referenceImage,
    payload.inputImage,
    payload.input_image,
    payload.editImage,
    payload.image,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReferenceImageValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeImageItems(responseData) {
  const items = Array.isArray(responseData?.data) ? responseData.data : [];
  return items.map((item, index) => ({
    id: item.id || `image_${index + 1}`,
    index,
    url: item.url || item.image_url || '',
    b64Json: item.b64_json || item.b64 || '',
    mimeType: item.mime_type || 'image/png',
    revisedPrompt: item.revised_prompt || '',
  }));
}

function buildHistoryEntry(payload, upstreamPayload, responseData, userId, billing = {}) {
  const timestamp = nowIso();
  const sessionId =
    typeof payload.sessionId === 'string' && payload.sessionId.trim() !== ''
      ? payload.sessionId.trim()
      : randomId('image_session');

  return {
    id: randomId('imgmsg'),
    userId,
    sessionId,
    session_id: sessionId,
    parentId:
      typeof payload.parentId === 'string' && payload.parentId.trim() !== ''
        ? payload.parentId.trim()
        : typeof payload.parent_entry_id === 'string' && payload.parent_entry_id.trim() !== ''
          ? payload.parent_entry_id.trim()
          : '',
    parent_entry_id:
      typeof payload.parentId === 'string' && payload.parentId.trim() !== ''
        ? payload.parentId.trim()
        : typeof payload.parent_entry_id === 'string' && payload.parent_entry_id.trim() !== ''
          ? payload.parent_entry_id.trim()
          : '',
    kind: typeof payload.kind === 'string' && payload.kind.trim() !== '' ? payload.kind.trim() : 'generation',
    prompt: extractPrompt(payload),
    input: Array.isArray(payload.input) ? payload.input : [],
    model: upstreamPayload.model || '',
    size: upstreamPayload.size || '',
    quality: upstreamPayload.quality || '',
    background: upstreamPayload.background || '',
    outputFormat: upstreamPayload.output_format || upstreamPayload.outputFormat || '',
    output_format: upstreamPayload.output_format || upstreamPayload.outputFormat || '',
    referenceMode: payload.reference_mode || 'prompt_only',
    reference_mode: payload.reference_mode || 'prompt_only',
    referenceApplied: Boolean(payload.reference_applied),
    reference_applied: Boolean(payload.reference_applied),
    referenceDowngraded: Boolean(payload.reference_downgraded),
    reference_downgraded: Boolean(payload.reference_downgraded),
    referenceDowngradeReason: payload.reference_downgrade_reason || '',
    reference_downgrade_reason: payload.reference_downgrade_reason || '',
    request: upstreamPayload,
    response: responseData,
    responseId: responseData?.response_id || responseData?.responseId || '',
    previousResponseId: responseData?.previous_response_id || responseData?.previousResponseId || '',
    generationCallId: responseData?.generation_call_id || responseData?.generationCallId || '',
    images: normalizeImageItems(responseData),
    estimatedCharge: billing.estimatedCharge ?? 0,
    chargedAmount: billing.chargedAmount ?? 0,
    currency: billing.currency || 'CNY',
    billingStatus: billing.billingStatus || '',
    billingEventId: billing.billingEventId || '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildGenerationPayload(payload, defaultModel) {
  const upstreamPayload = {
    ...payload,
  };
  if (!upstreamPayload.model && defaultModel) {
    upstreamPayload.model = defaultModel;
  }

  delete upstreamPayload.reference_image;
  delete upstreamPayload.referenceImage;
  delete upstreamPayload.referenceImageUrl;
  delete upstreamPayload.input_image;
  delete upstreamPayload.image;
  delete upstreamPayload.reference_mode;
  delete upstreamPayload.reference_applied;
  delete upstreamPayload.reference_downgraded;
  delete upstreamPayload.reference_downgrade_reason;
  delete upstreamPayload.parentId;
  delete upstreamPayload.parent_entry_id;
  delete upstreamPayload.sessionId;
  delete upstreamPayload.kind;

  return upstreamPayload;
}

function buildEditPayload(payload, model, referenceImage) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', typeof payload.prompt === 'string' ? payload.prompt : extractPrompt(payload));

  if (payload.size) {
    form.append('size', String(payload.size));
  }
  if (payload.quality) {
    form.append('quality', String(payload.quality));
  }
  if (payload.n != null) {
    form.append('n', String(payload.n));
  }
  if (payload.background) {
    form.append('background', String(payload.background));
  }
  const outputFormat = payload.output_format || payload.outputFormat;
  if (outputFormat) {
    form.append('output_format', String(outputFormat));
  }

  const blob = dataUrlToBlob(referenceImage.image_url);
  if (blob) {
    form.append('image[]', blob, 'reference.png');
  } else {
    form.append('image_url', referenceImage.image_url);
  }

  return form;
}

function buildStoredRequestPayload(payload, model, referenceImage) {
  return {
    model,
    prompt: typeof payload.prompt === 'string' ? payload.prompt : extractPrompt(payload),
    size: payload.size,
    quality: payload.quality,
    n: payload.n,
    background: payload.background,
    output_format: payload.output_format || payload.outputFormat,
    reference_image: referenceImage?.image_url || '',
  };
}

export async function createImageGeneration({ config, store, logger, context }, payload) {
  const runtimeConfig = config;

  if (!runtimeConfig.openai.apiKey) {
    throw badRequest('OPENAI_IMAGE_API_KEY or OPENAI_API_KEY is not configured');
  }

  requireObject(payload, 'Image generation payload must be an object');
  if (typeof payload.prompt !== 'string' && !Array.isArray(payload.input)) {
    throw badRequest('Image generation requires "prompt" or "input"');
  }
  const pricing = calculateImageCharge(payload);
  await ensureSufficientBalance(store, context.userId, pricing.amount, {
    operation: 'image_generation',
  });

  const generationPayload = buildGenerationPayload(payload, runtimeConfig.openai.defaultModel);
  const selectedModel = generationPayload.model || '';
  const allowedModels = Array.isArray(runtimeConfig.openai.imageModels)
    ? runtimeConfig.openai.imageModels.filter(Boolean)
    : [];

  if (selectedModel && allowedModels.length > 0 && !allowedModels.includes(selectedModel)) {
    throw badRequest(
      `Image model "${selectedModel}" is not enabled for this service. Allowed models: ${allowedModels.join(', ')}`,
    );
  }

  const parentId =
    (typeof payload.parentId === 'string' && payload.parentId.trim()) ||
    (typeof payload.parent_entry_id === 'string' && payload.parent_entry_id.trim()) ||
    '';
  let referenceImage = normalizeReferenceImage(payload);
  if (!referenceImage && store) {
    if (parentId) {
      const parentEntry = await store.findImageHistoryEntryByUserId(parentId, context.userId);
      const parentImage = parentEntry?.images?.[0];
      referenceImage = normalizeReferenceImageValue(
        parentImage?.url || parentImage?.b64Json || parentImage?.b64_json || '',
      );
    }
  }

  let requestPath = runtimeConfig.openai.imagesPath;
  let requestBody = generationPayload;
  let storedRequestPayload = generationPayload;
  let operation = 'openai.images';
  let referenceMode = 'prompt_only';
  let referenceApplied = false;
  let referenceDowngraded = false;
  let referenceDowngradeReason = '';

  if (referenceImage) {
    if (modelSupportsImageReference(selectedModel)) {
      requestPath = runtimeConfig.openai.imageEditsPath;
      requestBody = buildEditPayload(generationPayload, selectedModel, referenceImage);
      storedRequestPayload = buildStoredRequestPayload(generationPayload, selectedModel, referenceImage);
      operation = 'openai.images_edit';
      referenceMode = 'image_edit';
      referenceApplied = true;
    } else {
      referenceDowngraded = true;
      referenceDowngradeReason = `Model "${selectedModel}" does not support reference-image editing in the current compatibility layer.`;
    }
  }

  const result = await requestJson({
    method: 'POST',
    baseUrl: runtimeConfig.openai.baseUrl,
    path: requestPath,
    timeoutMs: runtimeConfig.openai.timeoutMs,
    headers: {
      authorization: `Bearer ${runtimeConfig.openai.apiKey}`,
      ...(requestBody instanceof FormData ? {} : { 'content-type': 'application/json' }),
    },
    body: requestBody,
    logger,
    requestId: context?.requestId,
    operation,
  });
  const chargeSourceId =
    result.data?.response_id || result.data?.responseId || result.data?.generation_call_id || randomId('image_charge');
  const chargeResult = await applyUsageCharge(store, {
    userId: context.userId,
    amount: pricing.amount,
    type: 'image_charge',
    sourceType: 'image_generation',
    sourceId: chargeSourceId,
    idempotencyKey: `image_charge:${chargeSourceId}`,
    metadata: {
      model: selectedModel,
      outputCount: pricing.outputCount,
    },
  });
  const billing = {
    estimatedCharge: pricing.amount,
    chargedAmount: pricing.amount,
    currency: pricing.currency,
    billingStatus: 'charged',
    billingEventId: chargeResult.billingEvent?.id || '',
  };

  const historyPayload = {
    ...payload,
    reference_mode: referenceMode,
    reference_applied: referenceApplied,
    reference_downgraded: referenceDowngraded,
    reference_downgrade_reason: referenceDowngradeReason,
  };
  const historyEntry = buildHistoryEntry(historyPayload, storedRequestPayload, result.data, context.userId, billing);
  if (store) {
    await store.upsertImageHistory(historyEntry);
  }

  return {
    ...result.data,
    reference_mode: referenceMode,
    reference_applied: referenceApplied,
    reference_downgraded: referenceDowngraded,
    reference_downgrade_reason: referenceDowngradeReason,
    referenceImageApplied: referenceApplied,
    referenceImageDowngraded: referenceDowngraded,
    referenceImageDowngradeReason: referenceDowngradeReason,
    historyId: historyEntry.id,
    history_id: historyEntry.id,
    sessionId: historyEntry.sessionId,
    session_id: historyEntry.sessionId,
    estimatedCharge: pricing.amount,
    chargedAmount: pricing.amount,
    currency: pricing.currency,
    billingStatus: 'charged',
    billingEventId: chargeResult.billingEvent?.id || '',
    images: historyEntry.images,
    history: historyEntry,
  };
}
