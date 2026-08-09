import { blackScholesGreeks, blackScholesPrice, yearsToExpiry } from "./options.mjs";
import { normalizeBar, normalizeOptionSnapshot } from "./schema.mjs";

const SESSION_START = Date.parse("2026-08-10T13:30:00.000Z");
const SESSION_END = Date.parse("2026-08-10T20:00:00.000Z");
const INTERVAL_MS = 15 * 60 * 1000;
const POINTS = 27;
const RATE = 0.043;
const DIVIDEND = 0.012;

const SECTORS = Object.freeze([
  ["XLK", "Technology", 1.42],
  ["XLC", "Communication", 1.12],
  ["XLY", "Consumer discretionary", 0.72],
  ["XLI", "Industrials", 0.38],
  ["XLF", "Financials", 0.21],
  ["XLV", "Health care", 0.1],
  ["XLP", "Consumer staples", -0.08],
  ["XLE", "Energy", 0.32],
  ["XLB", "Materials", -0.18],
  ["XLU", "Utilities", -0.34],
  ["XLRE", "Real estate", -0.24]
]);

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function progress(index) {
  return index / (POINTS - 1);
}

function ease(value) {
  return value * value * (3 - 2 * value);
}

function storylineReturn(index, peak, close) {
  const p = progress(index);
  if (p < 0.55) {
    return peak * ease(p / 0.55);
  }
  return peak + (close - peak) * ease((p - 0.55) / 0.45);
}

function timestamp(index) {
  return new Date(SESSION_START + index * INTERVAL_MS).toISOString();
}

function provenance(marketTimestamp, calculation) {
  return {
    source_provider: "MarketGlass",
    source_dataset: "synthetic-narrow-rally-v1",
    retrieved_at: "2026-08-09T00:00:00.000Z",
    market_timestamp: marketTimestamp,
    freshness: "synthetic deterministic fixture",
    license_mode: "public synthetic demo",
    calculation,
    assumptions: ["not provider market data", "not investment advice"],
    is_synthetic: true
  };
}

function underlyingPath(index) {
  const spyReturn = storylineReturn(index, 1.28, 0.96);
  const rspReturn = storylineReturn(index, 0.55, 0.18);
  const qqqReturn = storylineReturn(index, 1.68, 1.36);
  const smhReturn = storylineReturn(index, 1.35, 0.48);
  return {
    SPY: round(600 * (1 + spyReturn / 100), 2),
    RSP: round(180 * (1 + rspReturn / 100), 2),
    QQQ: round(540 * (1 + qqqReturn / 100), 2),
    SMH: round(285 * (1 + smhReturn / 100), 2)
  };
}

function sectorSnapshot(index, spyReturn) {
  const p = progress(index);
  return SECTORS.map(([symbol, label, terminal]) => {
    const concentrationBoost = ["XLK", "XLC", "XLY"].includes(symbol) ? 0.35 * Math.max(0, p - 0.38) : -0.14 * Math.max(0, p - 0.38);
    const reversal = ["XLK", "XLC"].includes(symbol) ? -0.18 * Math.max(0, p - 0.78) : 0;
    const returnPct = round((terminal * ease(p) + concentrationBoost + reversal) * (1 + 0.04 * Math.sin(index + terminal)), 2);
    return {
      symbol,
      label,
      returnPct,
      relativeToSpy: round(returnPct - spyReturn, 2),
      volumeRatio: round(0.76 + 0.55 * p + Math.abs(terminal) * 0.09, 2)
    };
  });
}

function makeBar(instrument, index, close) {
  const prior = index === 0 ? close * 0.9985 : underlyingPath(index - 1)[instrument];
  const open = prior;
  const wiggle = 0.001 + 0.00035 * Math.abs(Math.sin(index * 1.7));
  return normalizeBar(
    {
      instrument,
      timestamp: timestamp(index),
      open: round(open, 2),
      high: round(Math.max(open, close) * (1 + wiggle), 2),
      low: round(Math.min(open, close) * (1 - wiggle), 2),
      close,
      volume: Math.round((1_100_000 + 45_000 * index) * (1 + 0.3 * Math.abs(Math.sin(index))))
    },
    provenance(timestamp(index), "synthetic 15-minute bar")
  );
}

function impliedVolatilitySurface(spot, strike, years, type, index, dte) {
  const logMoneyness = Math.log(strike / spot);
  const p = progress(index);
  const shortDatedStress = dte === 0 ? 0.018 * Math.max(0, (p - 0.56) / 0.44) : 0;
  const skew = type === "put" ? 0.026 * Math.max(0, -logMoneyness + 0.015) : 0.009 * Math.max(0, logMoneyness);
  const smile = 0.55 * logMoneyness * logMoneyness;
  const term = Math.min(0.07, Math.sqrt(Math.max(years, 0.00001)) * 0.17);
  return clamp(0.164 + term + smile + skew + shortDatedStress, 0.08, 1.2);
}

function optionContract(spot, index, expiration, dte, strike, type) {
  const marketTimestamp = timestamp(index);
  const expiryTimestamp = dte === 0 ? "2026-08-10T20:00:00.000Z" : `${expiration}T20:00:00.000Z`;
  const years = yearsToExpiry(marketTimestamp, expiryTimestamp);
  const iv = impliedVolatilitySurface(spot, strike, years, type, index, dte);
  const theoretical = blackScholesPrice({
    spot,
    strike,
    volatility: iv,
    time: years,
    rate: RATE,
    dividend: DIVIDEND,
    type
  });
  const greeks = blackScholesGreeks({
    spot,
    strike,
    volatility: iv,
    time: years,
    rate: RATE,
    dividend: DIVIDEND,
    type
  });
  const distance = Math.abs(strike - spot) / spot;
  const spread = Math.max(0.02, theoretical * (0.012 + distance * 0.09 + (dte === 0 ? 0.006 : 0)));
  const mid = round(theoretical, 3);
  const quoteStatus = spread / Math.max(mid, 0.01) > 0.25 ? "wide" : "valid";
  const suffix = type === "call" ? "C" : "P";
  const contract = `SPY${expiration.slice(2).replaceAll("-", "")}${suffix}${String(Math.round(strike * 1000)).padStart(8, "0")}`;
  return normalizeOptionSnapshot(
    {
      contract,
      underlying: "SPY",
      expiration,
      strike,
      type,
      exercise_style: "american",
      multiplier: 100,
      timestamp: marketTimestamp,
      bid: round(Math.max(0, mid - spread / 2), 3),
      ask: round(mid + spread / 2, 3),
      mid,
      last: mid,
      volume: Math.round(35 + 1850 * Math.exp(-distance * 18) * (0.6 + progress(index))),
      open_interest: Math.round(240 + 2200 * Math.exp(-distance * 13) * (type === "put" ? 1.1 : 0.95)),
      underlying_price: spot,
      iv,
      delta: greeks.delta,
      gamma: greeks.gamma,
      theta: greeks.theta,
      vega: greeks.vega,
      iv_source: "synthetic_surface",
      greeks_source: greeks.status === "ok" ? "marketglass_model" : "unavailable",
      quote_status: quoteStatus
    },
    provenance(marketTimestamp, "Black-Scholes synthetic option fixture")
  );
}

function optionChain(index, spot) {
  const definitions = [
    ["2026-08-10", 0],
    ["2026-08-17", 7],
    ["2026-09-04", 25]
  ];
  const strikes = Array.from({ length: 15 }, (_, item) => 570 + item * 5);
  return definitions.flatMap(([expiration, dte]) =>
    strikes.flatMap((strike) => ["call", "put"].map((type) => optionContract(spot, index, expiration, dte, strike, type)))
  );
}

function buildTimeline() {
  const timeline = [];
  for (let index = 0; index < POINTS; index += 1) {
    const p = progress(index);
    const underlyings = underlyingPath(index);
    const spyReturn = ((underlyings.SPY / 600) - 1) * 100;
    const broadPhase = 69 - 16 * ease(Math.min(1, p / 0.42));
    const narrowPhase = 11 * Math.max(0, (p - 0.42) / 0.58);
    const breadthPct = round(clamp(broadPhase - narrowPhase + 1.2 * Math.sin(index / 2), 34, 72), 1);
    const advancing = Math.round((breadthPct / 100) * 500);
    const declining = 500 - advancing;
    const vix = round(15.35 - 0.7 * Math.min(1, p / 0.38) + 1.95 * Math.max(0, (p - 0.55) / 0.45), 2);
    const atmIv = round(0.171 - 0.008 * Math.min(1, p / 0.38) + 0.031 * Math.max(0, (p - 0.55) / 0.45), 4);
    const sectors = sectorSnapshot(index, spyReturn);
    timeline.push({
      timestamp: timestamp(index),
      underlyings,
      breadth: {
        positivePct: breadthPct,
        advancing,
        declining,
        advanceDecline: advancing - declining,
        upDownVolumeRatio: round(clamp(1.74 - 1.06 * p + 0.09 * Math.sin(index), 0.38, 2.1), 2),
        sourceLabel: "DERIVED ADVANCE-DECLINE (synthetic constituent fixture)"
      },
      concentration: {
        top1ContributionPct: round(clamp(18 + 10 * p, 0, 100), 1),
        top5ContributionPct: round(clamp(40 + 22 * p, 0, 100), 1),
        top10ContributionPct: round(clamp(57 + 29 * p, 0, 100), 1),
        membership: "SYNTHETIC - no historical constituent claim"
      },
      sectors,
      sectorDispersion: round(0.49 + 0.41 * p, 2),
      realizedCorrelation: round(0.35 + 0.34 * p + 0.03 * Math.sin(index), 2),
      relativeVolume: round(0.74 + 0.68 * p, 2),
      volatility: {
        vix,
        vix9d: round(vix + 0.72 + 0.85 * Math.max(0, p - 0.57), 2),
        atmIv,
        term: [
          { dte: 0, iv: round(atmIv + 0.006, 4) },
          { dte: 7, iv: round(atmIv - 0.011, 4) },
          { dte: 25, iv: round(atmIv - 0.021, 4) }
        ]
      },
      provenance: provenance(timestamp(index), "synthetic synchronized market state")
    });
  }
  return timeline;
}

function historicalSessionTimestamp(sessionIndex, barIndex) {
  const cursor = new Date("2025-10-06T13:30:00.000Z");
  let acceptedSessions = 0;
  while (acceptedSessions < sessionIndex) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      acceptedSessions += 1;
    }
  }
  return new Date(cursor.getTime() + barIndex * INTERVAL_MS).toISOString();
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function buildHistory() {
  const barsPerSession = 26;
  const sessionCount = 6;
  const drafts = [];
  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    for (let barIndex = 0; barIndex < barsPerSession; barIndex += 1) {
      const pulse = barIndex < 5 ? 0 : Math.sin(((barIndex - 5) / 20) * Math.PI);
      const wave = Math.sin(barIndex * 0.92 + sessionIndex * 0.31);
      const drift = sessionIndex * 0.002;
      const spy = 600 * (1 + drift + 0.00012 * barIndex + 0.014 * pulse + 0.0007 * wave);
      const rsp = 180 * (1 + drift * 0.55 + 0.00008 * barIndex + 0.0046 * pulse + 0.0008 * Math.sin(barIndex * 0.84 + 0.5));
      const breadthPct = round(clamp(65 - 23 * pulse + 1.8 * wave + sessionIndex * 0.3, 29, 76), 2);
      const ivChange = round(-0.005 + 0.02 * pulse + 0.0015 * Math.cos(barIndex * 0.7 + sessionIndex), 4);
      drafts.push({
        sequence: drafts.length,
        sessionIndex,
        barIndex,
        timestamp: historicalSessionTimestamp(sessionIndex, barIndex),
        spy,
        rsp,
        breadthPct,
        ivChange,
        realizedVol: round(12.5 + 4.8 * pulse + 0.8 * Math.abs(wave), 2),
        sectorDispersion: round(0.29 + 0.47 * pulse + 0.03 * sessionIndex, 3),
        relativeVolume: round(0.71 + 0.67 * (barIndex / (barsPerSession - 1)) + 0.14 * pulse, 2)
      });
    }
  }
  return drafts.map((row) => {
    const prior = row.barIndex >= 2 ? drafts[row.sequence - 2] : null;
    const spyReturn30m = prior ? round(((row.spy / prior.spy) - 1) * 100, 3) : null;
    const rspReturn30m = prior ? round(((row.rsp / prior.rsp) - 1) * 100, 3) : null;
    const future = row.barIndex <= barsPerSession - 5 ? drafts.slice(row.sequence + 1, row.sequence + 5) : [];
    const forwardReturns = future.map((point) => ((point.spy / row.spy) - 1) * 100);
    const futureSteps = [row.spy, ...future.map((point) => point.spy)];
    const stepReturns = futureSteps.slice(1).map((price, index) => Math.log(price / futureSteps[index]));
    const forwardRealizedVol = sampleStandardDeviation(stepReturns);
    return {
      sequence: row.sequence,
      timestamp: row.timestamp,
      features: {
        spyReturn30m,
        rspSpyReturn30m: spyReturn30m == null || rspReturn30m == null ? null : round(rspReturn30m - spyReturn30m, 3),
        breadthPct: row.breadthPct,
        ivChange: row.ivChange,
        realizedVol: row.realizedVol,
        sectorDispersion: row.sectorDispersion,
        relativeVolume: row.relativeVolume
      },
      targets: {
        forwardReturn60m: forwardReturns.length === 4 ? round(forwardReturns.at(-1), 3) : null,
        forwardRealizedVol60m: forwardRealizedVol == null ? null : round(forwardRealizedVol * Math.sqrt(26 * 252) * 100, 3),
        forwardMaxAdverse60m: forwardReturns.length === 4 ? round(Math.min(0, ...forwardReturns), 3) : null
      },
      provenance: provenance(row.timestamp, "synthetic 15-minute historical state fixture with forward targets withheld at session boundaries")
    };
  });
}

let cachedSession = null;

export function getDemoSession() {
  if (cachedSession) {
    return structuredClone(cachedSession);
  }
  const timeline = buildTimeline();
  const bars = { SPY: [], RSP: [], QQQ: [], SMH: [] };
  const optionSnapshots = {};
  for (let index = 0; index < timeline.length; index += 1) {
    for (const instrument of Object.keys(bars)) {
      bars[instrument].push(makeBar(instrument, index, timeline[index].underlyings[instrument]));
    }
    optionSnapshots[timeline[index].timestamp] = optionChain(index, timeline[index].underlyings.SPY);
  }
  cachedSession = {
    id: "synthetic-narrow-rally-2026-08-10",
    mode: "demo",
    title: "Narrow rally, rising short-dated uncertainty",
    interval_minutes: 15,
    timezone: "America/New_York",
    timeline,
    bars,
    optionSnapshots,
    history: buildHistory(),
    events: [
      { index: 0, label: "Open: broad participation" },
      { index: 6, label: "11:00: mega-cap leadership increases" },
      { index: 12, label: "12:30: RSP/SPY weakens" },
      { index: 16, label: "13:30: breadth deterioration visible" },
      { index: 18, label: "14:00: short-dated skew steepens" },
      { index: 22, label: "15:00: reversal probe" }
    ],
    assumptions: {
      rate: RATE,
      dividend: DIVIDEND,
      option_model: "Black-Scholes European-style approximation for a synthetic American-style ETF option fixture",
      constituent_mode: "synthetic"
    },
    provenance: provenance(timestamp(0), "deterministic demo dataset"),
    fixture_version: "synthetic-narrow-rally-v1"
  };
  return structuredClone(cachedSession);
}
