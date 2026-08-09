import { HttpProvider, ProviderError } from "./base.mjs";

export class TradierProvider extends HttpProvider {
  constructor(environment = process.env, options = {}) {
    const sandbox = Boolean(environment.TRADIER_SANDBOX_TOKEN) && !environment.TRADIER_TOKEN;
    const apiKey = sandbox ? environment.TRADIER_SANDBOX_TOKEN : environment.TRADIER_TOKEN || null;
    super({
      name: "Tradier",
      apiKey,
      rateLimit: 60,
      fetchFn: options.fetchFn,
      capabilities: {
        equity_quote: Boolean(apiKey),
        options_chain: Boolean(apiKey),
        options_greeks: Boolean(apiKey) && !sandbox,
        realtime: Boolean(apiKey) && !sandbox,
        delayed: Boolean(apiKey) && sandbox
      }
    });
    this.sandbox = sandbox;
    this.baseUrl = sandbox ? "https://sandbox.tradier.com" : "https://api.tradier.com";
  }

  health() {
    return { ...super.health(), environment: this.sandbox ? "sandbox delayed" : this.apiKey ? "brokerage / live token" : "not configured" };
  }

  async optionChain(symbol, expiration) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration ?? "")) {
      throw new ProviderError(this.name, "invalid_expiration", "Tradier option chains require an expiration in YYYY-MM-DD format.", { status: 400 });
    }
    const url = new URL(`${this.baseUrl}/v1/markets/options/chains`);
    url.searchParams.set("symbol", String(symbol).toUpperCase());
    url.searchParams.set("expiration", expiration);
    const response = await this.request({
      cacheKey: `chain:${symbol}:${expiration}:${this.sandbox}`,
      url,
      options: { headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" } },
      capability: "options_chain",
      ttlMs: this.sandbox ? 60_000 : 15_000
    });
    if (!response.payload.options?.option) {
      throw new ProviderError(this.name, "malformed_response", "Tradier option chain response is missing options.");
    }
    return response;
  }
}
