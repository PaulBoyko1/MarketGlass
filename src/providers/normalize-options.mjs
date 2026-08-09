import { normalizeOptionSnapshot } from "../core/schema.mjs";
import { ProviderError } from "./base.mjs";

function finite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function text(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function optionType(value) {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "call" || normalized === "c" ? "call" : normalized === "put" || normalized === "p" ? "put" : null;
}

function expiration(value) {
  const candidate = text(value);
  return candidate?.slice(0, 10) ?? null;
}

function timestamp(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 1e17 ? value / 1e6 : value > 1e14 ? value / 1e3 : value > 1e11 ? value : value * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function rowsFor(provider, payload) {
  if (provider === "Massive") return Array.isArray(payload.results) ? payload.results : [];
  const rows = payload.options?.option ?? payload.options ?? [];
  return Array.isArray(rows) ? rows : [rows];
}

function normalizeRow(provider, row, { symbol, retrievedAt }) {
  const details = row.details ?? {};
  const quote = row.last_quote ?? row.quote ?? row;
  const greeks = row.greeks ?? {};
  const bid = finite(quote.bid, row.bid);
  const ask = finite(quote.ask, row.ask);
  const strike = finite(details.strike_price, row.strike, row.strike_price);
  const type = optionType(details.contract_type ?? row.option_type ?? row.type);
  const contract = text(details.ticker, row.symbol, row.contract, row.option_symbol);
  const optionExpiration = expiration(details.expiration_date ?? row.expiration_date ?? row.expiration);
  const underlyingPrice = finite(row.underlying_asset?.price, row.underlying?.price, row.underlying_price, row.underlying_last);
  if (bid == null || ask == null || strike == null || !type || !contract || !optionExpiration || underlyingPrice == null) {
    return null;
  }
  const quoteTimestamp = timestamp(quote.last_updated ?? row.trade_date ?? row.updated_at ?? row.timestamp, retrievedAt);
  const spread = ask - bid;
  return normalizeOptionSnapshot(
    {
      contract,
      underlying: text(details.underlying_ticker, row.root_symbol, row.underlying_symbol, row.underlying, symbol) ?? symbol,
      expiration: optionExpiration,
      strike,
      type,
      exercise_style: details.exercise_style ?? row.exercise_style,
      multiplier: finite(details.shares_per_contract, row.contract_size, row.multiplier, 100),
      timestamp: quoteTimestamp,
      bid,
      ask,
      mid: (bid + ask) / 2,
      last: finite(row.last_trade?.price, row.last, row.last_price),
      volume: finite(row.day?.volume, row.volume, 0),
      open_interest: finite(row.open_interest),
      underlying_price: underlyingPrice,
      iv: finite(row.implied_volatility, greeks.mid_iv, row.iv),
      delta: finite(greeks.delta, row.delta),
      gamma: finite(greeks.gamma, row.gamma),
      theta: finite(greeks.theta, row.theta),
      vega: finite(greeks.vega, row.vega),
      iv_source: finite(row.implied_volatility, greeks.mid_iv, row.iv) == null ? "unavailable" : "vendor",
      greeks_source: finite(greeks.delta, row.delta) == null ? "unavailable" : "vendor",
      quote_status: bid < 0 || ask < 0 || bid > ask ? "invalid" : spread > Math.max(0.5, (bid + ask) * 0.2) ? "wide" : "valid"
    },
    {
      source_provider: provider,
      source_dataset: provider === "Massive" ? "options snapshot" : "options chain",
      retrieved_at: retrievedAt,
      market_timestamp: quoteTimestamp,
      freshness: "provider response; see provider plan and exchange permissions",
      license_mode: "provider plan-bound",
      calculation: "provider quote normalized by MarketGlass",
      assumptions: ["midpoint is derived from provider bid and ask", "not investment advice"],
      is_synthetic: false
    }
  );
}

export function normalizeProviderOptionChain(provider, response, { symbol }) {
  const retrievedAt = response.fetched_at ?? new Date().toISOString();
  const contracts = rowsFor(provider, response.payload)
    .map((row) => {
      try {
        return normalizeRow(provider, row, { symbol, retrievedAt });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (contracts.length === 0) {
    throw new ProviderError(provider, "malformed_response", `${provider} returned no normalizable option contracts.`);
  }
  return {
    provider,
    cache: response.cache,
    fetched_at: retrievedAt,
    contracts,
    provenance: {
      source_provider: provider,
      source_dataset: provider === "Massive" ? "options snapshot" : "options chain",
      is_synthetic: false
    }
  };
}
