export class ProviderError extends Error {
  constructor(provider, code, message, options = {}) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }

  toSafeJson() {
    return {
      provider: this.provider,
      code: this.code,
      message: this.message,
      status: this.status,
      retry_after_ms: this.retryAfterMs
    };
  }
}

export class RequestCache {
  #entries = new Map();

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}

export class RateBudget {
  constructor(limit, windowMs = 60_000) {
    this.limit = Math.max(1, Number(limit) || 1);
    this.windowMs = windowMs;
    this.used = 0;
    this.windowStartedAt = Date.now();
  }

  consume(cost = 1) {
    const now = Date.now();
    if (now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now;
      this.used = 0;
    }
    if (this.used + cost > this.limit) {
      return { ok: false, retryAfterMs: this.windowMs - (now - this.windowStartedAt) };
    }
    this.used += cost;
    return { ok: true, remaining: this.limit - this.used };
  }
}

export class HttpProvider {
  constructor({ name, apiKey, capabilities, rateLimit = 5, fetchFn = fetch, cache = new RequestCache() }) {
    this.name = name;
    this.apiKey = apiKey || null;
    this.capabilities = capabilities;
    this.fetchFn = fetchFn;
    this.cache = cache;
    this.budget = new RateBudget(rateLimit);
  }

  health() {
    return {
      name: this.name,
      configured: Boolean(this.apiKey),
      capabilities: this.capabilities,
      key_exposed: false
    };
  }

  async request({ cacheKey, url, options = {}, ttlMs = 30_000, capability }) {
    if (!this.apiKey) {
      throw new ProviderError(this.name, "not_configured", `${this.name} is not configured.`, { status: 401 });
    }
    if (capability && !this.capabilities[capability]) {
      throw new ProviderError(this.name, "capability_unavailable", `${this.name} plan does not expose ${capability}.`, { status: 403 });
    }
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cache: "hit" };
    }
    const budget = this.budget.consume();
    if (!budget.ok) {
      throw new ProviderError(this.name, "rate_limited", `${this.name} request budget is exhausted.`, {
        status: 429,
        retryAfterMs: budget.retryAfterMs
      });
    }
    let response;
    try {
      response = await this.fetchFn(url, options);
    } catch {
      throw new ProviderError(this.name, "network_error", `${this.name} request could not be completed.`);
    }
    if (!response.ok) {
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      throw new ProviderError(this.name, response.status === 429 ? "rate_limited" : "upstream_error", `${this.name} returned ${response.status}.`, {
        status: response.status,
        retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : null
      });
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderError(this.name, "invalid_response", `${this.name} returned invalid JSON.`);
    }
    const value = {
      payload,
      fetched_at: new Date().toISOString(),
      cache: "miss"
    };
    this.cache.set(cacheKey, value, ttlMs);
    return value;
  }
}
