import { HttpProvider, ProviderError } from "./base.mjs";

export class TwelveDataProvider extends HttpProvider {
  constructor(environment = process.env, options = {}) {
    const rateLimit = Number(environment.TWELVE_DATA_CREDITS_PER_MINUTE ?? 8);
    super({
      name: "Twelve Data",
      apiKey: environment.TWELVE_DATA_API_KEY || null,
      rateLimit,
      fetchFn: options.fetchFn,
      capabilities: { equity_history: Boolean(environment.TWELVE_DATA_API_KEY), equity_quote: Boolean(environment.TWELVE_DATA_API_KEY) }
    });
  }

  async timeSeries(symbol, interval = "1day") {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", String(symbol).toUpperCase());
    url.searchParams.set("interval", interval);
    url.searchParams.set("apikey", this.apiKey);
    const response = await this.request({
      cacheKey: `twelve:${symbol}:${interval}`,
      url,
      capability: "equity_history",
      ttlMs: 60_000
    });
    if (!Array.isArray(response.payload.values)) {
      throw new ProviderError(this.name, "malformed_response", "Twelve Data response is missing values.");
    }
    return response;
  }
}
