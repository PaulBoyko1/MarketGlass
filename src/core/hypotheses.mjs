const FIELD_LABELS = Object.freeze({
  spyReturn30m: "SPY 30m return",
  rspSpyReturn30m: "RSP minus SPY 30m return",
  breadthPct: "Positive breadth",
  ivChange: "ATM IV change",
  realizedVol: "Realized volatility",
  sectorDispersion: "Sector dispersion",
  relativeVolume: "Relative volume"
});

const TARGET_LABELS = Object.freeze({
  forwardReturn60m: "SPY next 60m return",
  forwardRealizedVol60m: "SPY next 60m realized volatility",
  forwardMaxAdverse60m: "SPY next 60m max adverse excursion"
});

const OPERATORS = new Set([">", ">=", "<", "<="]);

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function percentile(values, threshold) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const position = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * threshold)));
  return sorted[position];
}

function median(values) {
  return percentile(values, 0.5);
}

function standardDeviation(values, average) {
  if (values.length < 2) {
    return null;
  }
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function validateHypothesisSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["A structured hypothesis specification is required."] };
  }
  const conditions = Array.isArray(spec.conditions) ? spec.conditions : [];
  if (conditions.length === 0) {
    errors.push("Add at least one observable condition.");
  }
  for (const condition of conditions) {
    if (!Object.hasOwn(FIELD_LABELS, condition.field)) {
      errors.push(`Unsupported condition field: ${condition.field}`);
    }
    if (!OPERATORS.has(condition.operator)) {
      errors.push("Conditions must use a comparison operator.");
    }
    if (numeric(condition.threshold) == null) {
      errors.push("Condition thresholds must be finite.");
    }
  }
  if (!Object.hasOwn(TARGET_LABELS, spec.target?.field)) {
    errors.push("Choose a supported future target.");
  }
  const horizon = Number(spec.target?.horizonMinutes ?? 60);
  if (!Number.isFinite(horizon) || horizon <= 0) {
    errors.push("Target horizon must be positive.");
  }
  return { valid: errors.length === 0, errors };
}

export function conditionMatches(row, condition) {
  const value = numeric(row.features?.[condition.field]);
  const threshold = numeric(condition.threshold);
  if (value == null || threshold == null) {
    return false;
  }
  switch (condition.operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    default:
      return false;
  }
}

function selectNonOverlapping(rows, embargoSteps) {
  const selected = [];
  let nextEligible = -Infinity;
  for (const row of rows) {
    if (row.sequence >= nextEligible) {
      selected.push(row);
      nextEligible = row.sequence + embargoSteps;
    }
  }
  return selected;
}

export function summarizeDistribution(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) {
    return { n: 0, mean: null, median: null, std: null, p05: null, p25: null, p75: null, p95: null, ci95: null, hitRate: null };
  }
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const std = standardDeviation(usable, mean);
  const standardError = std == null ? null : std / Math.sqrt(usable.length);
  return {
    n: usable.length,
    mean,
    median: median(usable),
    std,
    p05: percentile(usable, 0.05),
    p25: percentile(usable, 0.25),
    p75: percentile(usable, 0.75),
    p95: percentile(usable, 0.95),
    ci95: standardError == null ? null : [mean - 1.96 * standardError, mean + 1.96 * standardError],
    hitRate: usable.filter((value) => value > 0).length / usable.length
  };
}

export function runChronologicalExperiment(history, spec, options = {}) {
  const validation = validateHypothesisSpec(spec);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }
  const sorted = [...history].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const split = Math.max(1, Math.floor(sorted.length * (options.trainFraction ?? 0.7)));
  const embargoSteps = Math.max(1, Math.round((spec.target.horizonMinutes ?? 60) / (options.intervalMinutes ?? 15)));
  const evaluate = (rows) => {
    const candidates = rows.filter(
      (row) => spec.conditions.every((condition) => conditionMatches(row, condition)) && numeric(row.targets?.[spec.target.field]) != null
    );
    const events = selectNonOverlapping(candidates, embargoSteps);
    const values = events.map((row) => Number(row.targets[spec.target.field]));
    return { events, values, summary: summarizeDistribution(values) };
  };
  // Purge rows whose forward target could cross into the held-out period.
  const train = evaluate(sorted.slice(0, Math.max(0, split - embargoSteps)));
  const holdout = evaluate(sorted.slice(split));
  const all = evaluate(sorted);
  const relatedTests = Math.max(1, Number(options.relatedTests ?? 1));
  return {
    experiment_id: options.experimentId ?? `mg-${Date.now().toString(36)}`,
    spec,
    data_source: options.dataSource ?? "synthetic fixture",
    data_hash: options.dataHash ?? "unknown",
    software_commit: options.softwareCommit ?? "local",
    run_timestamp: options.runTimestamp ?? new Date().toISOString(),
    validation: {
      method: "chronological train/holdout with event spacing embargo",
      split_timestamp: sorted[split]?.timestamp ?? null,
      embargo_steps: embargoSteps,
      purged_train_rows: Math.min(split, embargoSteps),
      related_tests: relatedTests,
      multiple_testing_risk: relatedTests > 1 ? "elevated" : "initial"
    },
    train,
    holdout,
    all,
    compiled_conditions: spec.conditions.map(
      (condition) => `${condition.field} ${condition.operator} ${Number(condition.threshold)}`
    ),
    target_label: TARGET_LABELS[spec.target.field]
  };
}

export function findAnalogues(history, selected, options = {}) {
  const dimensions = options.dimensions ?? Object.keys(FIELD_LABELS);
  const pastOnly = options.pastOnly !== false;
  const prior = history
    .filter((row) => (!pastOnly || row.timestamp < selected.timestamp))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const usable = prior.filter((row) => dimensions.every((field) => numeric(row.features?.[field]) != null));
  if (usable.length === 0) {
    return [];
  }
  const scales = Object.fromEntries(
    dimensions.map((field) => {
      const values = usable.map((row) => Number(row.features[field]));
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return [field, standardDeviation(values, average) || 1];
    })
  );
  return usable
    .map((row) => {
      const decomposition = dimensions.map((field) => {
        const delta = (Number(row.features[field]) - Number(selected.features[field])) / scales[field];
        return { field, distance: Math.abs(delta) };
      });
      const distance = Math.sqrt(decomposition.reduce((sum, item) => sum + item.distance ** 2, 0));
      return {
        ...row,
        distance,
        similarity: 1 / (1 + distance),
        decomposition: decomposition.sort((left, right) => right.distance - left.distance)
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, options.limit ?? 8);
}

export function proposeSpecFromObservation(start, end) {
  const spyReturn = Number(end.spyReturn) - Number(start.spyReturn);
  const relative = Number(end.rspSpyReturn) - Number(start.rspSpyReturn);
  const breadthChange = Number(end.breadthPct) - Number(start.breadthPct);
  const ivChange = Number(end.ivChange) - Number(start.ivChange);
  return {
    name: "Selected interval: participation and volatility divergence",
    universe: "SPY synthetic session history",
    conditions: [
      { field: "spyReturn30m", operator: ">", threshold: Math.max(0.15, Number(spyReturn.toFixed(2))) },
      { field: "rspSpyReturn30m", operator: "<", threshold: Math.min(-0.05, Number(relative.toFixed(2))) },
      { field: "breadthPct", operator: "<", threshold: Math.max(25, Number((end.breadthPct + breadthChange / 2).toFixed(1))) },
      // Keep the synthetic visual selection inside the documented historical fixture range.
      { field: "ivChange", operator: ">", threshold: Math.max(0.002, Math.min(0.006, Number(ivChange.toFixed(3)))) }
    ],
    target: { field: "forwardReturn60m", horizonMinutes: 60 },
    source: { start: start.timestamp, end: end.timestamp, observation: "visual selection" }
  };
}

export function hypothesisFieldOptions() {
  return Object.entries(FIELD_LABELS).map(([value, label]) => ({ value, label }));
}

export function hypothesisTargetOptions() {
  return Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label }));
}
