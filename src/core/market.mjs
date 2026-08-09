function number(value, fallback = 0) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

export function percentChange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) {
    return null;
  }
  return ((end / start) - 1) * 100;
}

export function rollingReturn(values, index, window) {
  const start = values[index - window];
  const end = values[index];
  return index >= window ? percentChange(start, end) : null;
}

export function annualizedRealizedVol(bars, lookback = 6, periodsPerYear = 26 * 252) {
  if (!Array.isArray(bars) || bars.length < lookback + 1) {
    return null;
  }
  const window = bars.slice(-(lookback + 1));
  const returns = [];
  for (let index = 1; index < window.length; index += 1) {
    const previous = number(window[index - 1].close, NaN);
    const current = number(window[index].close, NaN);
    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }
  if (returns.length < 2) {
    return null;
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * periodsPerYear) * 100;
}

export function alignByTimestamp(series) {
  const values = new Map();
  for (const entry of series) {
    for (const point of entry.points ?? []) {
      const key = new Date(point.timestamp).toISOString();
      if (!values.has(key)) {
        values.set(key, { timestamp: key });
      }
      values.get(key)[entry.name] = point.value;
    }
  }
  return [...values.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function marketStateAt(session, index) {
  const bounded = Math.max(0, Math.min(index, session.timeline.length - 1));
  const tick = session.timeline[bounded];
  const first = session.timeline[0];
  const spy = tick.underlyings.SPY;
  const rsp = tick.underlyings.RSP;
  const qqq = tick.underlyings.QQQ;
  const smh = tick.underlyings.SMH;
  const spyBars = session.bars.SPY.slice(0, bounded + 1);
  // A labeled 30-minute return must not quietly become a 15-minute return at the open.
  const window = 2;
  const spyValues = session.timeline.map((row) => row.underlyings.SPY);
  const rspValues = session.timeline.map((row) => row.underlyings.RSP);
  const spyReturn30m = rollingReturn(spyValues, bounded, window);
  const rspReturn30m = rollingReturn(rspValues, bounded, window);
  const state = {
    timestamp: tick.timestamp,
    index: bounded,
    spy,
    rsp,
    qqq,
    smh,
    spyReturn: percentChange(first.underlyings.SPY, spy),
    rspReturn: percentChange(first.underlyings.RSP, rsp),
    rspSpyReturn: percentChange(first.underlyings.RSP, rsp) - percentChange(first.underlyings.SPY, spy),
    spyReturn30m,
    rspSpyReturn30m: spyReturn30m == null || rspReturn30m == null ? null : rspReturn30m - spyReturn30m,
    breadthPct: tick.breadth.positivePct,
    advanceDecline: tick.breadth.advanceDecline,
    upDownVolumeRatio: tick.breadth.upDownVolumeRatio,
    concentrationTop10: tick.concentration.top10ContributionPct,
    realizedVol: annualizedRealizedVol(spyBars),
    vix: tick.volatility.vix,
    vix9d: tick.volatility.vix9d,
    atmIv: tick.volatility.atmIv,
    ivChange: tick.volatility.atmIv - first.volatility.atmIv,
    sectorDispersion: tick.sectorDispersion,
    realizedCorrelation: tick.realizedCorrelation,
    relativeVolume: tick.relativeVolume,
    sectors: tick.sectors,
    provenance: tick.provenance
  };
  return state;
}

export function stateVector(state) {
  return {
    indexTrend: number(state.spyReturn),
    equalWeightRelative: number(state.rspSpyReturn),
    breadth: number(state.breadthPct),
    concentration: number(state.concentrationTop10),
    realizedVol: number(state.realizedVol),
    impliedVol: number(state.atmIv) * 100,
    sectorDispersion: number(state.sectorDispersion),
    realizedCorrelation: number(state.realizedCorrelation),
    relativeVolume: number(state.relativeVolume)
  };
}

export function compareMoments(left, right) {
  return {
    timestamps: [left.timestamp, right.timestamp],
    rows: [
      { label: "SPY return", left: left.spyReturn, right: right.spyReturn, unit: "%" },
      { label: "RSP minus SPY", left: left.rspSpyReturn, right: right.rspSpyReturn, unit: "pp" },
      { label: "Positive breadth", left: left.breadthPct, right: right.breadthPct, unit: "%" },
      { label: "Top-10 contribution", left: left.concentrationTop10, right: right.concentrationTop10, unit: "%" },
      { label: "ATM IV", left: left.atmIv * 100, right: right.atmIv * 100, unit: "%" },
      { label: "Realized correlation", left: left.realizedCorrelation, right: right.realizedCorrelation, unit: "" }
    ]
  };
}

export function surfaceQuality(points) {
  const usable = points.filter((point) => Number.isFinite(point.iv) && point.quote_status === "valid");
  const maturities = new Set(usable.map((point) => point.expiration));
  const strikes = new Set(usable.map((point) => point.strike));
  const grouped = new Map();
  for (const point of usable) {
    const key = `${point.type}:${point.strike}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(point);
  }
  let calendarVarianceViolations = 0;
  for (const group of grouped.values()) {
    const ordered = [...group].sort((left, right) => left.expiration.localeCompare(right.expiration));
    const first = Date.parse(`${ordered[0]?.expiration}T00:00:00.000Z`);
    let previous = -Infinity;
    for (const point of ordered) {
      const expiry = Date.parse(`${point.expiration}T00:00:00.000Z`);
      const years = Number.isFinite(expiry) && Number.isFinite(first) ? Math.max(1 / 365, (expiry - first + 86_400_000) / (365 * 86_400_000)) : null;
      const totalVariance = years == null ? null : point.iv ** 2 * years;
      if (totalVariance != null && totalVariance + 1e-8 < previous) calendarVarianceViolations += 1;
      if (totalVariance != null) previous = totalVariance;
    }
  }
  const covered = usable.length >= 12 && maturities.size >= 2 && strikes.size >= 5;
  const quality = !covered ? "sparse" : calendarVarianceViolations ? "caution" : "usable";
  return {
    quality,
    rawCount: usable.length,
    maturities: maturities.size,
    strikes: strikes.size,
    calendar_variance_violations: calendarVarianceViolations,
    note:
      quality === "usable"
        ? "Validated raw coverage passes a simple calendar total-variance check. This is not an arbitrage-free fitted surface."
        : quality === "caution"
          ? "Raw coverage exists, but the simple calendar total-variance check found a potential violation. Treat the mesh as a visual aid only."
        : "Sparse or unstable raw points; the mesh is intentionally de-emphasized."
  };
}
