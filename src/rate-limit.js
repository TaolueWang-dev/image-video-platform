export class InMemoryRateLimiter {
  constructor() {
    this.windows = new Map();
  }

  check(key, { limit, windowMs }) {
    const now = Date.now();
    const existing = this.windows.get(key);
    const windowState =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + windowMs,
          };

    windowState.count += 1;
    this.windows.set(key, windowState);

    const allowed = windowState.count <= limit;
    const remaining = Math.max(limit - windowState.count, 0);
    const retryAfterMs = allowed ? 0 : Math.max(windowState.resetAt - now, 0);

    return {
      allowed,
      limit,
      remaining,
      resetAt: windowState.resetAt,
      retryAfterMs,
    };
  }
}
