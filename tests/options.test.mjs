import assert from "node:assert/strict";
import test from "node:test";

import {
  blackScholesGreeks,
  blackScholesPrice,
  impliedVolatility,
  noArbitrageBounds,
  normalCdf,
  scenarioPnlSurface
} from "../src/core/options.mjs";

function closeTo(actual, expected, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("Black-Scholes pricing preserves a known benchmark and put-call parity", () => {
  const inputs = { spot: 100, strike: 100, volatility: 0.2, time: 1, rate: 0.05, dividend: 0 };
  const call = blackScholesPrice({ ...inputs, type: "call" });
  const put = blackScholesPrice({ ...inputs, type: "put" });

  closeTo(normalCdf(0), 0.5, 1e-7);
  closeTo(call, 10.4506, 0.001);
  closeTo(call - put, inputs.spot - inputs.strike * Math.exp(-inputs.rate * inputs.time), 0.001);
});

test("implied volatility round-trips a valid theoretical option price", () => {
  const input = { spot: 603, strike: 605, volatility: 0.327, time: 14 / 365, rate: 0.043, dividend: 0.012, type: "call" };
  const marketPrice = blackScholesPrice(input);
  const result = impliedVolatility({ ...input, marketPrice });

  assert.equal(result.status, "converged");
  closeTo(result.iv, input.volatility, 1e-5);
});

test("option math labels impossible and unstable inputs instead of inventing an IV", () => {
  const bounds = noArbitrageBounds({ spot: 100, strike: 100, time: 1, rate: 0.05, type: "call" });
  const impossible = impliedVolatility({ marketPrice: bounds.upper + 1, spot: 100, strike: 100, time: 1, rate: 0.05, type: "call" });
  const expiring = impliedVolatility({ marketPrice: 1, spot: 100, strike: 100, time: 0, type: "call" });
  const greeks = blackScholesGreeks({ spot: 100, strike: 100, volatility: 0.2, time: 1, rate: 0.05, type: "call" });

  assert.equal(impossible.status, "outside_no_arbitrage_bounds");
  assert.equal(expiring.status, "too_close_to_expiry");
  assert.equal(greeks.status, "ok");
  assert.ok(greeks.delta > 0 && greeks.delta < 1);
  assert.ok(greeks.gamma > 0);
  assert.ok(greeks.vega > 0);
});

test("P and L surface keeps dimensions stable and responds to the directional spot shock", () => {
  const surface = scenarioPnlSurface({
    spot: 600,
    points: 5,
    position: { type: "call", side: "long", strike: 600, quantity: 1, multiplier: 100, volatility: 0.2, time: 7 / 365 }
  });

  assert.equal(surface.values.length, 5);
  assert.ok(surface.values.every((row) => row.length === 5));
  assert.ok(surface.values[2][4] > surface.values[2][0]);
  assert.equal(surface.assumptions.model, "Black-Scholes European-style approximation");
});

test("P and L surface rejects invalid grid and position inputs instead of returning NaN values", () => {
  assert.throws(
    () => scenarioPnlSurface({ spot: 600, points: 1, position: { type: "call", strike: 600, volatility: 0.2, time: 1 / 365 } }),
    /points must be an integer/
  );
  assert.throws(
    () => scenarioPnlSurface({ spot: 600, position: { type: "call", strike: 600, quantity: 0, volatility: 0.2, time: 1 / 365 } }),
    /quantity/
  );
});
