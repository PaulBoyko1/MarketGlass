function finite(value) {
  return Number.isFinite(Number(value));
}

function signFor(snapshot, mode) {
  if (mode === "unsigned") {
    return 1;
  }
  if (mode === "dealer_short_all") {
    return -1;
  }
  if (mode === "calls_long_puts_short") {
    return snapshot.type === "call" ? 1 : -1;
  }
  return 1;
}

export const GAMMA_MODES = Object.freeze({
  unsigned: {
    label: "Unsigned gamma magnitude",
    warning: "Magnitude only. Open interest does not identify the position holder or dealer side."
  },
  dealer_short_all: {
    label: "Scenario: dealer short all listed OI",
    warning: "Illustrative sign convention only. It assumes dealers are short every contract."
  },
  calls_long_puts_short: {
    label: "Scenario: calls positive, puts negative",
    warning: "Illustrative sign convention only. Contract type is not observed position sign."
  }
});

export function gammaExposureByStrike(chain, { mode = "unsigned", spot } = {}) {
  if (!Object.hasOwn(GAMMA_MODES, mode)) {
    throw new RangeError(`Unsupported gamma mode: ${mode}`);
  }
  const rows = new Map();
  for (const snapshot of chain) {
    if (!finite(snapshot.gamma) || !finite(snapshot.open_interest) || !finite(snapshot.multiplier) || !finite(spot)) {
      continue;
    }
    const magnitude = Math.abs(snapshot.gamma * snapshot.open_interest * snapshot.multiplier * spot * spot * 0.01);
    const current = rows.get(snapshot.strike) ?? { strike: snapshot.strike, magnitude: 0, signed: 0, oi: 0 };
    current.magnitude += magnitude;
    current.signed += magnitude * signFor(snapshot, mode);
    current.oi += snapshot.open_interest;
    rows.set(snapshot.strike, current);
  }
  return {
    mode,
    definition: "Gamma x open interest x contract multiplier x spot squared x 1% spot move",
    warning: GAMMA_MODES[mode].warning,
    rows: [...rows.values()].sort((left, right) => left.strike - right.strike),
    totalMagnitude: [...rows.values()].reduce((sum, row) => sum + row.magnitude, 0),
    totalSigned: [...rows.values()].reduce((sum, row) => sum + row.signed, 0)
  };
}
