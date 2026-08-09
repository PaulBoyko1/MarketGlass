const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);
const MIN_TIME = 1 / (365 * 24 * 60 * 2);

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / SQRT_TWO_PI;
}

// Abramowitz and Stegun 7.1.26 approximation; sufficient for a transparent demo model.
export function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function validateInputs({ spot, strike, volatility, time, rate = 0, dividend = 0, type }) {
  if (![spot, strike, volatility, time, rate, dividend].every(finite)) {
    throw new RangeError("Option inputs must be finite.");
  }
  if (spot <= 0 || strike <= 0 || volatility < 0 || time < 0) {
    throw new RangeError("Spot, strike, and volatility must be positive; time must not be negative.");
  }
  if (type !== "call" && type !== "put") {
    throw new RangeError("Option type must be call or put.");
  }
}

export function noArbitrageBounds({ spot, strike, time, rate = 0, dividend = 0, type }) {
  validateInputs({ spot, strike, volatility: 0, time, rate, dividend, type });
  const discountedSpot = spot * Math.exp(-dividend * time);
  const discountedStrike = strike * Math.exp(-rate * time);
  if (type === "call") {
    return { lower: Math.max(0, discountedSpot - discountedStrike), upper: discountedSpot };
  }
  return { lower: Math.max(0, discountedStrike - discountedSpot), upper: discountedStrike };
}

export function blackScholesPrice({ spot, strike, volatility, time, rate = 0, dividend = 0, type }) {
  validateInputs({ spot, strike, volatility, time, rate, dividend, type });
  if (time <= MIN_TIME || volatility <= 0) {
    return noArbitrageBounds({ spot, strike, time, rate, dividend, type }).lower;
  }
  const rootTime = Math.sqrt(time);
  const d1 =
    (Math.log(spot / strike) + (rate - dividend + 0.5 * volatility * volatility) * time) /
    (volatility * rootTime);
  const d2 = d1 - volatility * rootTime;
  const discountedSpot = spot * Math.exp(-dividend * time);
  const discountedStrike = strike * Math.exp(-rate * time);
  if (type === "call") {
    return discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2);
  }
  return discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1);
}

export function blackScholesGreeks({ spot, strike, volatility, time, rate = 0, dividend = 0, type }) {
  validateInputs({ spot, strike, volatility, time, rate, dividend, type });
  if (time <= MIN_TIME || volatility <= 0) {
    return { delta: null, gamma: null, theta: null, vega: null, status: "too_close_to_expiry" };
  }
  const rootTime = Math.sqrt(time);
  const d1 =
    (Math.log(spot / strike) + (rate - dividend + 0.5 * volatility * volatility) * time) /
    (volatility * rootTime);
  const d2 = d1 - volatility * rootTime;
  const discountSpot = Math.exp(-dividend * time);
  const discountStrike = Math.exp(-rate * time);
  const pdf = normalPdf(d1);
  const commonTheta = -(spot * discountSpot * pdf * volatility) / (2 * rootTime);
  const callTheta = commonTheta - rate * strike * discountStrike * normalCdf(d2) + dividend * spot * discountSpot * normalCdf(d1);
  const putTheta = commonTheta + rate * strike * discountStrike * normalCdf(-d2) - dividend * spot * discountSpot * normalCdf(-d1);
  return {
    delta: type === "call" ? discountSpot * normalCdf(d1) : discountSpot * (normalCdf(d1) - 1),
    gamma: (discountSpot * pdf) / (spot * volatility * rootTime),
    theta: (type === "call" ? callTheta : putTheta) / 365,
    vega: spot * discountSpot * pdf * rootTime,
    status: "ok"
  };
}

export function impliedVolatility({
  marketPrice,
  spot,
  strike,
  time,
  rate = 0,
  dividend = 0,
  type,
  tolerance = 1e-7,
  maxIterations = 120
}) {
  if (!finite(marketPrice)) {
    return { iv: null, status: "invalid_price", iterations: 0 };
  }
  try {
    validateInputs({ spot, strike, volatility: 0, time, rate, dividend, type });
  } catch {
    return { iv: null, status: "invalid_input", iterations: 0 };
  }
  if (time <= MIN_TIME) {
    return { iv: null, status: "too_close_to_expiry", iterations: 0 };
  }
  const { lower, upper } = noArbitrageBounds({ spot, strike, time, rate, dividend, type });
  if (marketPrice < lower - tolerance || marketPrice > upper + tolerance) {
    return { iv: null, status: "outside_no_arbitrage_bounds", iterations: 0, lower, upper };
  }
  if (marketPrice <= lower + tolerance) {
    return { iv: null, status: "at_intrinsic_bound", iterations: 0, lower, upper };
  }

  let low = 1e-6;
  let high = 2;
  while (blackScholesPrice({ spot, strike, volatility: high, time, rate, dividend, type }) < marketPrice && high < 16) {
    high *= 2;
  }
  if (high >= 16 && blackScholesPrice({ spot, strike, volatility: high, time, rate, dividend, type }) < marketPrice) {
    return { iv: null, status: "upper_bracket_failed", iterations: 0, lower, upper };
  }

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    const estimate = blackScholesPrice({ spot, strike, volatility: mid, time, rate, dividend, type });
    if (Math.abs(estimate - marketPrice) <= tolerance) {
      return { iv: mid, status: "converged", iterations: iteration, lower, upper };
    }
    if (estimate > marketPrice) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return { iv: (low + high) / 2, status: "max_iterations", iterations: maxIterations, lower, upper };
}

export function yearsToExpiry(timestamp, expiryTimestamp) {
  const start = new Date(timestamp).getTime();
  const end = new Date(expiryTimestamp).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.max(0, (end - start) / (365 * 24 * 60 * 60 * 1000));
}

export function enrichOptionSnapshot(snapshot, assumptions) {
  const time = yearsToExpiry(snapshot.timestamp, assumptions.expiryTimestamp);
  if (time == null) {
    return { ...snapshot, iv: null, iv_source: "unavailable", greeks_source: "unavailable", iv_status: "invalid_time" };
  }
  const input = {
    marketPrice: snapshot.mid,
    spot: snapshot.underlying_price,
    strike: snapshot.strike,
    time,
    rate: assumptions.rate ?? 0,
    dividend: assumptions.dividend ?? 0,
    type: snapshot.type
  };
  const inferred = impliedVolatility(input);
  if (inferred.iv == null) {
    return {
      ...snapshot,
      iv: null,
      iv_source: "unavailable",
      greeks_source: "unavailable",
      iv_status: inferred.status,
      iv_inputs: { ...input, marketPrice: snapshot.mid }
    };
  }
  const greeks = blackScholesGreeks({ ...input, volatility: inferred.iv });
  return {
    ...snapshot,
    iv: inferred.iv,
    delta: greeks.delta,
    gamma: greeks.gamma,
    theta: greeks.theta,
    vega: greeks.vega,
    iv_source: "marketglass_model",
    greeks_source: "marketglass_model",
    iv_status: inferred.status,
    iv_inputs: { ...input, marketPrice: snapshot.mid }
  };
}

export function scenarioPnlSurface({ position, spot, rate = 0.043, dividend = 0.012, points = 17 }) {
  if (!Number.isInteger(points) || points < 2 || points > 101) {
    throw new RangeError("P and L surface points must be an integer between 2 and 101.");
  }
  if (!position || typeof position !== "object") {
    throw new RangeError("A position is required for the P and L surface.");
  }
  validateInputs({
    spot,
    strike: position.strike,
    volatility: position.volatility,
    time: position.time,
    rate,
    dividend,
    type: position.type
  });
  const quantity = Number(position.quantity ?? 1);
  const multiplier = Number(position.multiplier ?? 100);
  const timeDecay = Number(position.timeDecay ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(timeDecay) || timeDecay < 0) {
    throw new RangeError("P and L quantity and multiplier must be positive; time decay must be non-negative.");
  }
  const shocks = Array.from({ length: points }, (_, index) => -0.12 + (0.24 * index) / (points - 1));
  const volShocks = Array.from({ length: points }, (_, index) => -0.12 + (0.24 * index) / (points - 1));
  const currentValue = blackScholesPrice({
    spot,
    strike: position.strike,
    volatility: position.volatility,
    time: position.time,
    rate,
    dividend,
    type: position.type
  });
  const direction = position.side === "short" ? -1 : 1;
  return {
    spotShocks: shocks,
    volShocks,
    values: volShocks.map((volShock) =>
      shocks.map((spotShock) => {
        const theoretical = blackScholesPrice({
          spot: spot * (1 + spotShock),
          strike: position.strike,
          volatility: Math.max(0.01, position.volatility + volShock),
          time: Math.max(MIN_TIME, position.time - timeDecay),
          rate,
          dividend,
          type: position.type
        });
        return (theoretical - currentValue) * quantity * direction * multiplier;
      })
    ),
    assumptions: { model: "Black-Scholes European-style approximation", rate, dividend, currentValue }
  };
}
