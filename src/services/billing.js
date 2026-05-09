import { AppError, badRequest } from '../errors.js';

export const BILLING_CURRENCY = 'CNY';
export const IMAGE_PRICE_PER_OUTPUT_CENTS = 15;
export const VIDEO_PRICE_PER_SECOND_CENTS = 150;

function normalizePositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw badRequest(`Field "${fieldName}" must be a positive integer`);
  }
  return parsed;
}

export function calculateImageCharge(payload) {
  const outputCount = normalizePositiveInteger(payload?.n, 1, 'n');
  return {
    outputCount,
    amount: outputCount * IMAGE_PRICE_PER_OUTPUT_CENTS,
    currency: BILLING_CURRENCY,
  };
}

export function calculateVideoCharge(payload, defaultDurationSeconds) {
  const durationSeconds = normalizePositiveInteger(payload?.duration, defaultDurationSeconds, 'duration');
  return {
    durationSeconds,
    amount: durationSeconds * VIDEO_PRICE_PER_SECOND_CENTS,
    currency: BILLING_CURRENCY,
  };
}

export async function ensureSufficientBalance(store, userId, amount, metadata = {}) {
  const account = await store.getAccountByUserId(userId);
  if (account.balance < amount) {
    throw new AppError(402, 'Insufficient balance', {
      code: 'insufficient_balance',
      requiredAmount: amount,
      balance: account.balance,
      currency: account.currency || BILLING_CURRENCY,
      ...metadata,
    });
  }
  return account;
}

export async function applyUsageCharge(store, {
  userId,
  amount,
  type,
  sourceType,
  sourceId,
  idempotencyKey,
  metadata = {},
}) {
  const result = await store.applyBillingAdjustment({
    userId,
    type,
    amountDelta: -Math.abs(amount),
    sourceType,
    sourceId,
    idempotencyKey,
    metadata,
    allowNegative: false,
  });

  if (result.insufficient) {
    throw new AppError(409, 'Balance changed before charge could be applied', {
      code: 'balance_conflict',
      requiredAmount: amount,
      balance: result.account?.balance ?? 0,
      currency: result.account?.currency || BILLING_CURRENCY,
    });
  }

  return result;
}
