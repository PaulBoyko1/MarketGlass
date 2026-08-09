import assert from "node:assert/strict";
import test from "node:test";

import { SchemaError, normalizeBar, normalizeOptionSnapshot, normalizeProvenance } from "../src/core/schema.mjs";

const timestamp = "2026-08-10T14:00:00.000Z";

function option(overrides = {}) {
  return {
    contract: "SPY260810C00600000",
    underlying: "SPY",
    expiration: "2026-08-10",
    strike: 600,
    type: "call",
    timestamp,
    bid: 2,
    ask: 2.2,
    mid: 2.1,
    underlying_price: 601,
    iv: 0.2,
    ...overrides
  };
}

test("normalizers preserve provenance and a coherent option quote", () => {
  const provenance = normalizeProvenance({ source_provider: "Fixture", source_dataset: "unit", retrieved_at: timestamp, is_synthetic: true });
  const bar = normalizeBar({ instrument: "SPY", timestamp, open: 600, high: 603, low: 599, close: 602, volume: 100 }, provenance);
  const snapshot = normalizeOptionSnapshot(option(), provenance);

  assert.equal(bar.provenance.source_provider, "Fixture");
  assert.equal(snapshot.mid, 2.1);
  assert.equal(snapshot.exercise_style, "american");
  assert.equal(snapshot.provenance.is_synthetic, true);
});

test("normalizers reject internally impossible market data", () => {
  assert.throws(
    () => normalizeBar({ instrument: "SPY", timestamp, open: 600, high: 599, low: 598, close: 601, volume: 1 }),
    SchemaError
  );
  assert.throws(() => normalizeOptionSnapshot(option({ mid: 3 })), /mid must fall within/);
  assert.throws(() => normalizeOptionSnapshot(option({ expiration: "2026-02-30" })), /real calendar date/);
  assert.throws(() => normalizeOptionSnapshot(option({ strike: 0 })), /strike must be positive/);
  assert.throws(() => normalizeOptionSnapshot(option({ underlying_price: -1 })), /underlying_price must be positive/);
  assert.throws(() => normalizeOptionSnapshot(option({ iv: -0.1 })), /iv must not be negative/);
  assert.throws(() => normalizeOptionSnapshot(option({ volume: -1 })), /volume must not be negative/);
});

test("option quote states are bounded to explicit data-quality labels", () => {
  assert.equal(normalizeOptionSnapshot(option({ quote_status: "wide" })).quote_status, "wide");
  assert.equal(normalizeOptionSnapshot(option({ quote_status: "unexpected" })).quote_status, "unavailable");
});
