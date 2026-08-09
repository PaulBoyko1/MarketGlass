export const DATA_MODES = Object.freeze(["demo", "free", "recorded", "premium"]);

export class SchemaError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "SchemaError";
    this.field = field;
  }
}

function finite(value, field) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new SchemaError(`${field} must be finite.`, field);
  }
  return numeric;
}

function nonNegative(value, field) {
  const numeric = finite(value, field);
  if (numeric < 0) {
    throw new SchemaError(`${field} must not be negative.`, field);
  }
  return numeric;
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new SchemaError(`${field} must be a non-empty string.`, field);
  }
  return value.trim();
}

function normalizeExpiration(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new SchemaError("expiration must use YYYY-MM-DD.", "expiration");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new SchemaError("expiration must be a real calendar date.", "expiration");
  }
  return value;
}

export function normalizeTimestamp(value, field = "timestamp") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SchemaError(`${field} must be an ISO timestamp.`, field);
  }
  return date.toISOString();
}

export function normalizeProvenance(value = {}) {
  const sourceProvider = value.source_provider ?? value.provider ?? "unknown";
  const sourceDataset = value.source_dataset ?? value.dataset ?? "unknown";
  return Object.freeze({
    source_provider: text(sourceProvider, "source_provider"),
    source_dataset: text(sourceDataset, "source_dataset"),
    retrieved_at: normalizeTimestamp(value.retrieved_at ?? new Date().toISOString(), "retrieved_at"),
    market_timestamp: value.market_timestamp
      ? normalizeTimestamp(value.market_timestamp, "market_timestamp")
      : null,
    freshness: typeof value.freshness === "string" ? value.freshness : "unknown",
    license_mode: typeof value.license_mode === "string" ? value.license_mode : "unknown",
    calculation: typeof value.calculation === "string" ? value.calculation : "provider supplied",
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.map(String) : [],
    is_synthetic: Boolean(value.is_synthetic)
  });
}

export function normalizeBar(value, provenance) {
  const open = finite(value.open, "open");
  const high = finite(value.high, "high");
  const low = finite(value.low, "low");
  const close = finite(value.close, "close");
  if (low > Math.min(open, close) || high < Math.max(open, close) || high < low) {
    throw new SchemaError("OHLC values are internally inconsistent.", "bar");
  }
  return Object.freeze({
    instrument: text(value.instrument, "instrument"),
    timestamp: normalizeTimestamp(value.timestamp),
    open,
    high,
    low,
    close,
    volume: nonNegative(value.volume ?? 0, "volume"),
    adjustment: value.adjustment === "adjusted" ? "adjusted" : "unadjusted",
    provenance: normalizeProvenance(provenance ?? value.provenance)
  });
}

export function normalizeOptionContract(value) {
  const optionType = value.type ?? value.option_type;
  if (optionType !== "call" && optionType !== "put") {
    throw new SchemaError("type must be call or put.", "type");
  }
  const strike = finite(value.strike, "strike");
  if (strike <= 0) {
    throw new SchemaError("strike must be positive.", "strike");
  }
  const multiplier = finite(value.multiplier ?? 100, "multiplier");
  if (multiplier <= 0) {
    throw new SchemaError("multiplier must be positive.", "multiplier");
  }
  return Object.freeze({
    contract: text(value.contract, "contract"),
    underlying: text(value.underlying, "underlying"),
    expiration: normalizeExpiration(value.expiration),
    strike,
    type: optionType,
    exercise_style: value.exercise_style === "european" ? "european" : "american",
    multiplier
  });
}

export function normalizeOptionSnapshot(value, provenance) {
  const contract = normalizeOptionContract(value);
  const bid = finite(value.bid, "bid");
  const ask = finite(value.ask, "ask");
  if (bid < 0 || ask < 0 || bid > ask) {
    throw new SchemaError("Option quote must satisfy 0 <= bid <= ask.", "quote");
  }
  const mid = value.mid == null ? (bid + ask) / 2 : finite(value.mid, "mid");
  if (mid < bid || mid > ask) {
    throw new SchemaError("Option mid must fall within the quoted bid-ask range.", "mid");
  }
  const underlyingPrice = finite(value.underlying_price, "underlying_price");
  if (underlyingPrice <= 0) {
    throw new SchemaError("underlying_price must be positive.", "underlying_price");
  }
  const iv = value.iv == null ? null : finite(value.iv, "iv");
  if (iv != null && iv < 0) {
    throw new SchemaError("iv must not be negative.", "iv");
  }
  const normalized = {
    ...contract,
    timestamp: normalizeTimestamp(value.timestamp),
    bid,
    ask,
    mid,
    last: value.last == null ? null : nonNegative(value.last, "last"),
    volume: nonNegative(value.volume ?? 0, "volume"),
    open_interest: value.open_interest == null ? null : nonNegative(value.open_interest, "open_interest"),
    underlying_price: underlyingPrice,
    iv,
    delta: value.delta == null ? null : finite(value.delta, "delta"),
    gamma: value.gamma == null ? null : finite(value.gamma, "gamma"),
    theta: value.theta == null ? null : finite(value.theta, "theta"),
    vega: value.vega == null ? null : finite(value.vega, "vega"),
    iv_source: ["vendor", "marketglass_model", "synthetic_surface", "unavailable"].includes(value.iv_source)
      ? value.iv_source
      : "unavailable",
    greeks_source: ["vendor", "marketglass_model", "synthetic_surface", "unavailable"].includes(
      value.greeks_source
    )
      ? value.greeks_source
      : "unavailable",
    quote_status: ["valid", "wide", "invalid", "stale", "unavailable"].includes(value.quote_status ?? "valid")
      ? value.quote_status ?? "valid"
      : "unavailable",
    provenance: normalizeProvenance(provenance ?? value.provenance)
  };
  return Object.freeze(normalized);
}

export function assertDataMode(mode) {
  if (!DATA_MODES.includes(mode)) {
    throw new SchemaError(`Unsupported data mode: ${mode}`, "data_mode");
  }
  return mode;
}
