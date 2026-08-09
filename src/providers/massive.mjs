import { HttpProvider, ProviderError } from "./base.mjs";

const PLAN_ORDER = Object.freeze({ basic: 0, starter: 1, developer: 2, advanced: 3 });

function planAtLeast(plan, threshold) {
  return (PLAN_ORDER[plan] ?? 0) >= PLAN_ORDER[threshold];
}

export class MassiveProvider extends HttpProvider {
  constructor(environment = process.env, options = {}) {
    const plan = String(environment.MASSIVE_PLAN ?? "basic").toLowerCase();
    const apiKey = environment.MASSIVE_API_KEY || environment.POLYGON_API_KEY || null;
    const rateLimit = Number(environment.MASSIVE_CALLS_PER_MINUTE ?? 5);
    super({
      name: "Massive",
      apiKey,
      rateLimit: Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : 5,
      fetchFn: options.fetchFn,
      capabilities: {
        equity_history: Boolean(apiKey),
        options_reference: Boolean(apiKey),
        options_history: Boolean(apiKey),
        options_snapshot: Boolean(apiKey) && planAtLeast(plan, "starter"),
        options_greeks: Boolean(apiKey) && planAtLeast(plan, "starter"),
        options_open_interest: Boolean(apiKey) && planAtLeast(plan, "starter"),
        websocket: Boolean(apiKey) && planAtLeast(plan, "starter"),
        realtime: Boolean(apiKey) && planAtLeast(plan, "advanced")
      }
    });
    this.plan = Object.hasOwn(PLAN_ORDER, plan) ? plan : "basic";
    this.legacyPolygonKey = !environment.MASSIVE_API_KEY && Boolean(environment.POLYGON_API_KEY);
  }

  health() {
    return { ...super.health(), plan: this.plan, legacy_polygon_key: this.legacyPolygonKey };
  }

  async historicalBars(symbol, from, to) {
    const normalized = String(symbol).toUpperCase();
    const url = new URL(`https://api.massive.com/v2/aggs/ticker/${normalized}/range/1/day/${from}/${to}`);
    url.searchParams.set("adjusted", "true");
    url.searchParams.set("apiKey", this.apiKey);
    const response = await this.request({
      cacheKey: `bars:${normalized}:${from}:${to}`,
      url,
      capability: "equity_history",
      ttlMs: 5 * 60_000
    });
    if (!Array.isArray(response.payload.results)) {
      throw new ProviderError(this.name, "malformed_response", "Massive bars response is missing results.");
    }
    return response;
  }

  async optionContracts(symbol) {
    const url = new URL("https://api.massive.com/v3/reference/options/contracts");
    url.searchParams.set("underlying_ticker", String(symbol).toUpperCase());
    url.searchParams.set("apiKey", this.apiKey);
    const response = await this.request({
      cacheKey: `option-contracts:${symbol}`,
      url,
      capability: "options_reference",
      ttlMs: 60 * 60_000
    });
    if (!Array.isArray(response.payload.results)) {
      throw new ProviderError(this.name, "malformed_response", "Massive option reference response is missing results.");
    }
    return response;
  }

  async optionChain(symbol, expiration = "") {
    const normalized = String(symbol).toUpperCase();
    const url = new URL(`https://api.massive.com/v3/snapshot/options/${normalized}`);
    url.searchParams.set("apiKey", this.apiKey);
    if (expiration) {
      url.searchParams.set("expiration_date", expiration);
    }
    const response = await this.request({
      cacheKey: `option-snapshot:${normalized}:${expiration}`,
      url,
      capability: "options_snapshot",
      ttlMs: 15_000
    });
    if (!Array.isArray(response.payload.results)) {
      throw new ProviderError(this.name, "malformed_response", "Massive options snapshot response is missing results.");
    }
    return response;
  }
}
