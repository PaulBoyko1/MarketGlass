import { HttpProvider, ProviderError } from "./base.mjs";

export class FredProvider extends HttpProvider {
  constructor(environment = process.env, options = {}) {
    super({
      name: "FRED",
      apiKey: environment.FRED_API_KEY || null,
      rateLimit: 60,
      fetchFn: options.fetchFn,
      capabilities: { macro_history: Boolean(environment.FRED_API_KEY), vintage_history: Boolean(environment.FRED_API_KEY) }
    });
  }

  async observations(seriesId, options = {}) {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("api_key", this.apiKey);
    if (options.realtimeStart) {
      url.searchParams.set("realtime_start", options.realtimeStart);
    }
    if (options.realtimeEnd) {
      url.searchParams.set("realtime_end", options.realtimeEnd);
    }
    const response = await this.request({
      cacheKey: `fred:${seriesId}:${options.realtimeStart ?? "latest"}:${options.realtimeEnd ?? "latest"}`,
      url,
      capability: "macro_history",
      ttlMs: 6 * 60 * 60_000
    });
    if (!Array.isArray(response.payload.observations)) {
      throw new ProviderError(this.name, "malformed_response", "FRED response is missing observations.");
    }
    return response;
  }
}
