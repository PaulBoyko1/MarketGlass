import assert from "node:assert/strict";
import test from "node:test";

import { HttpProvider, ProviderError, RateBudget } from "../src/providers/base.mjs";
import { MassiveProvider } from "../src/providers/massive.mjs";
import { TradierProvider } from "../src/providers/tradier.mjs";
import { FredProvider } from "../src/providers/fred.mjs";
import { normalizeProviderOptionChain } from "../src/providers/normalize-options.mjs";

function response(payload, { ok = true, status = 200, retryAfter = null } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => name === "retry-after" ? retryAfter : null },
    json: async () => payload
  };
}

test("HTTP providers cache successful responses and keep API keys server-side", async () => {
  let calls = 0;
  const provider = new HttpProvider({
    name: "Fixture",
    apiKey: "secret-value",
    capabilities: { quote: true },
    fetchFn: async () => {
      calls += 1;
      return response({ price: 601 });
    }
  });

  const first = await provider.request({ cacheKey: "spy", url: "https://example.test/spy", capability: "quote" });
  const second = await provider.request({ cacheKey: "spy", url: "https://example.test/spy", capability: "quote" });

  assert.equal(first.cache, "miss");
  assert.equal(second.cache, "hit");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(provider.health()).includes("secret-value"), false);
});

test("provider failures are typed and rate-budgeted", async () => {
  const budget = new RateBudget(1, 60_000);
  assert.equal(budget.consume().ok, true);
  assert.equal(budget.consume().ok, false);

  const missing = new HttpProvider({ name: "Missing", capabilities: {} });
  await assert.rejects(
    () => missing.request({ cacheKey: "x", url: "https://example.test/x" }),
    (error) => error instanceof ProviderError && error.code === "not_configured" && error.status === 401
  );

  const failing = new HttpProvider({
    name: "Limited",
    apiKey: "secret",
    capabilities: { quote: true },
    fetchFn: async () => response({}, { ok: false, status: 429, retryAfter: "3" })
  });
  await assert.rejects(
    () => failing.request({ cacheKey: "x", url: "https://example.test/x", capability: "quote" }),
    (error) => error instanceof ProviderError && error.code === "rate_limited" && error.retryAfterMs === 3000
  );
});

test("Massive and Tradier adapters target their documented server-side endpoints", async () => {
  let massiveUrl = "";
  const massive = new MassiveProvider(
    { MASSIVE_API_KEY: "massive-secret", MASSIVE_PLAN: "starter" },
    { fetchFn: async (url) => { massiveUrl = String(url); return response({ results: [] }); } }
  );
  await massive.optionChain("spy", "2026-08-10");
  assert.match(massiveUrl, /\/v3\/snapshot\/options\/SPY/);
  assert.match(massiveUrl, /expiration_date=2026-08-10/);
  assert.equal(massive.health().capabilities.options_snapshot, true);
  assert.equal(JSON.stringify(massive.health()).includes("massive-secret"), false);

  let tradierCall;
  const tradier = new TradierProvider(
    { TRADIER_SANDBOX_TOKEN: "tradier-secret" },
    { fetchFn: async (url, options) => { tradierCall = { url: String(url), options }; return response({ options: { option: [] } }); } }
  );
  await tradier.optionChain("spy", "2026-08-10");
  assert.match(tradierCall.url, /^https:\/\/sandbox\.tradier\.com\/v1\/markets\/options\/chains/);
  assert.equal(tradierCall.options.headers.Authorization, "Bearer tradier-secret");
  assert.equal(tradier.health().capabilities.options_greeks, false);
  await assert.rejects(
    () => tradier.optionChain("spy", ""),
    (error) => error instanceof ProviderError && error.code === "invalid_expiration" && error.status === 400
  );
});

test("FRED cache keys retain both requested vintage boundaries", async () => {
  let calls = 0;
  const fred = new FredProvider(
    { FRED_API_KEY: "fred-secret" },
    { fetchFn: async () => { calls += 1; return response({ observations: [] }); } }
  );

  await fred.observations("DFF", { realtimeStart: "2025-01-01", realtimeEnd: "2025-01-31" });
  await fred.observations("DFF", { realtimeStart: "2025-01-01", realtimeEnd: "2025-02-28" });
  assert.equal(calls, 2);
  assert.equal(JSON.stringify(fred.health()).includes("fred-secret"), false);
});

test("provider option chains normalize to the canonical quote schema without provider secrets", () => {
  const normalized = normalizeProviderOptionChain(
    "Massive",
    {
      cache: "miss",
      fetched_at: "2026-08-09T00:00:00.000Z",
      payload: {
        results: [
          {
            details: { ticker: "O:SPY260810C00600000", underlying_ticker: "SPY", expiration_date: "2026-08-10", strike_price: 600, contract_type: "call", shares_per_contract: 100 },
            last_quote: { bid: 2.1, ask: 2.3, last_updated: 1_786_000_000_000_000_000 },
            underlying_asset: { price: 601 },
            implied_volatility: 0.22,
            greeks: { delta: 0.52, gamma: 0.01, theta: -0.04, vega: 0.11 },
            day: { volume: 123 },
            open_interest: 456
          }
        ]
      }
    },
    { symbol: "SPY" }
  );

  assert.equal(normalized.provider, "Massive");
  assert.equal(normalized.contracts.length, 1);
  assert.equal(normalized.contracts[0].mid, 2.2);
  assert.equal(normalized.contracts[0].provenance.is_synthetic, false);
  assert.equal(normalized.contracts[0].iv_source, "vendor");
});
