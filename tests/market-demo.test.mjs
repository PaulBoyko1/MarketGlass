import assert from "node:assert/strict";
import test from "node:test";

import { getDemoSession } from "../src/core/demo-data.mjs";
import { marketStateAt, surfaceQuality } from "../src/core/market.mjs";

test("demo session is deterministic, labeled synthetic, and internally coherent", () => {
  const first = getDemoSession();
  const second = getDemoSession();
  const chain = first.optionSnapshots[first.timeline[4].timestamp];

  assert.deepEqual(first, second);
  assert.equal(first.provenance.is_synthetic, true);
  assert.equal(first.timeline.length, 27);
  assert.equal(first.history.length, 156);
  assert.ok(chain.every((option) => option.bid >= 0 && option.bid <= option.mid && option.mid <= option.ask));
  assert.ok(chain.every((option) => option.underlying_price === first.timeline[4].underlyings.SPY));
  assert.ok(chain.every((option) => option.iv >= 0));
  assert.equal(surfaceQuality(chain).quality, "usable");
});

test("market state does not relabel a partial opening window as a 30-minute return", () => {
  const session = getDemoSession();
  const opening = marketStateAt(session, 0);
  const fifteenMinutes = marketStateAt(session, 1);
  const thirtyMinutes = marketStateAt(session, 2);

  assert.equal(opening.spyReturn30m, null);
  assert.equal(opening.rspSpyReturn30m, null);
  assert.equal(fifteenMinutes.spyReturn30m, null);
  assert.ok(Number.isFinite(thirtyMinutes.spyReturn30m));
  assert.ok(Number.isFinite(thirtyMinutes.rspSpyReturn30m));
});

test("surface quality flags a simple calendar total-variance inversion", () => {
  const quality = surfaceQuality([
    { type: "call", strike: 600, expiration: "2026-08-10", iv: 0.8, quote_status: "valid" },
    { type: "call", strike: 600, expiration: "2026-09-10", iv: 0.05, quote_status: "valid" },
    { type: "put", strike: 595, expiration: "2026-08-10", iv: 0.8, quote_status: "valid" },
    { type: "put", strike: 595, expiration: "2026-09-10", iv: 0.05, quote_status: "valid" },
    { type: "call", strike: 605, expiration: "2026-08-10", iv: 0.8, quote_status: "valid" },
    { type: "call", strike: 605, expiration: "2026-09-10", iv: 0.05, quote_status: "valid" },
    { type: "put", strike: 590, expiration: "2026-08-10", iv: 0.8, quote_status: "valid" },
    { type: "put", strike: 590, expiration: "2026-09-10", iv: 0.05, quote_status: "valid" },
    { type: "call", strike: 610, expiration: "2026-08-10", iv: 0.8, quote_status: "valid" },
    { type: "call", strike: 610, expiration: "2026-09-10", iv: 0.05, quote_status: "valid" },
    { type: "put", strike: 585, expiration: "2026-08-10", iv: 0.8, quote_status: "valid" },
    { type: "put", strike: 585, expiration: "2026-09-10", iv: 0.05, quote_status: "valid" }
  ]);

  assert.equal(quality.quality, "caution");
  assert.ok(quality.calendar_variance_violations > 0);
});
