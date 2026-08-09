export const SCENARIO_KEYS = Object.freeze(["bear", "base", "bull"]);

const KIND_WEIGHT = Object.freeze({
  fact: 1,
  inference: 0.72,
  assumption: 0.45,
  catalyst: 0.58
});

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round((finiteNumber(value) + Number.EPSILON) * multiplier) / multiplier;
}

export function describeScenarios(input) {
  const source = Array.isArray(input) ? input : [];
  const scenarios = SCENARIO_KEYS.map((key, index) => {
    const keyed = source.find((candidate) => candidate && candidate.key === key);
    const candidate = keyed || source[index] || {};
    return {
      key,
      label: typeof candidate.label === "string" ? candidate.label : key,
      probability: round(clamp(finiteNumber(candidate.probability), 0, 100)),
      returnPct: round(clamp(finiteNumber(candidate.returnPct), -100, 1000))
    };
  });

  const totalProbability = round(
    scenarios.reduce((sum, scenario) => sum + scenario.probability, 0)
  );
  const expectedReturn = round(
    scenarios.reduce(
      (sum, scenario) => sum + (scenario.probability / 100) * scenario.returnPct,
      0
    )
  );
  const returns = scenarios.map((scenario) => scenario.returnPct);

  return {
    scenarios,
    totalProbability,
    expectedReturn,
    balanceGap: round(Math.abs(100 - totalProbability)),
    isBalanced: Math.abs(100 - totalProbability) < 0.01,
    downside: Math.min(...returns),
    upside: Math.max(...returns)
  };
}

export function validateEvidenceDraft(draft) {
  const value = draft && typeof draft === "object" ? draft : {};
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const source = typeof value.source === "string" ? value.source.trim() : "";
  const kind = Object.hasOwn(KIND_WEIGHT, value.kind) ? value.kind : "inference";
  const direction = value.direction === "challenge" ? "challenge" : "support";
  const confidence = finiteNumber(value.confidence, -1);
  const errors = [];

  if (title.length < 4) {
    errors.push("Write a specific claim of at least four characters.");
  }
  if (title.length > 180) {
    errors.push("Keep each claim under 180 characters.");
  }
  if (source.length > 120) {
    errors.push("Keep the source label under 120 characters.");
  }
  if (confidence < 0 || confidence > 100) {
    errors.push("Confidence must be between 0 and 100.");
  }

  return {
    valid: errors.length === 0,
    errors,
    entry: {
      title,
      source,
      kind,
      direction,
      confidence: round(clamp(confidence, 0, 100), 0)
    }
  };
}

export function scoreEvidence(entries) {
  const source = Array.isArray(entries) ? entries : [];
  let capacity = 0;
  let net = 0;
  let supportingCount = 0;
  let challengeCount = 0;
  const kinds = new Set();

  for (const candidate of source) {
    const validation = validateEvidenceDraft(candidate);
    if (!validation.valid) {
      continue;
    }

    const entry = validation.entry;
    const weight = KIND_WEIGHT[entry.kind];
    const impact = entry.confidence * weight;
    capacity += impact;
    net += entry.direction === "challenge" ? -impact : impact;
    kinds.add(entry.kind);
    if (entry.direction === "challenge") {
      challengeCount += 1;
    } else {
      supportingCount += 1;
    }
  }

  const conviction =
    capacity === 0 ? 50 : round(clamp(50 + (net / capacity) * 50, 0, 100), 0);

  return {
    count: supportingCount + challengeCount,
    supportingCount,
    challengeCount,
    kinds: [...kinds],
    net: round(net),
    conviction
  };
}

export function evaluateResearch(scenariosInput, evidenceInput, falsifiersInput) {
  const scenarios = describeScenarios(scenariosInput);
  const evidence = scoreEvidence(evidenceInput);
  const falsifierCount = Array.isArray(falsifiersInput)
    ? falsifiersInput.filter(
        (falsifier) => typeof falsifier === "string" && falsifier.trim().length >= 4
      ).length
    : 0;

  const scenarioScore = scenarios.isBalanced
    ? 30
    : Math.max(0, 30 - scenarios.balanceGap * 0.75);
  const evidenceScore = Math.min(40, evidence.count * 7 + evidence.kinds.length * 3);
  const tensionScore = Math.min(10, evidence.challengeCount * 5);
  const falsifierScore = Math.min(20, falsifierCount * 5);
  const score = Math.round(
    clamp(scenarioScore + evidenceScore + tensionScore + falsifierScore, 0, 100)
  );

  let label = "Early";
  if (score >= 75) {
    label = "Structured";
  } else if (score >= 45) {
    label = "Developing";
  }

  return {
    score,
    label,
    scenarioScore: round(scenarioScore),
    evidence,
    falsifierCount
  };
}

export function evaluateNotebookCompleteness(scenariosInput, evidenceInput, falsifiersInput, context = {}) {
  const scenarios = describeScenarios(scenariosInput);
  const evidence = Array.isArray(evidenceInput)
    ? evidenceInput.filter((entry) => validateEvidenceDraft(entry).valid)
    : [];
  const falsifiers = Array.isArray(falsifiersInput)
    ? falsifiersInput.filter((entry) => {
        const text = typeof entry === "string" ? entry : entry?.text;
        return typeof text === "string" && text.trim().length >= 4;
      })
    : [];
  const challengeCount = evidence.filter((entry) => validateEvidenceDraft(entry).entry.direction === "challenge").length;
  const sourcedCount = evidence.filter((entry) => validateEvidenceDraft(entry).entry.source.length > 0).length;
  const items = [
    { label: "Scenario probabilities total 100%", done: scenarios.isBalanced },
    { label: "At least two evidence claims", done: evidence.length >= 2 },
    { label: "At least one counterevidence claim", done: challengeCount >= 1 },
    { label: "At least one evidence source recorded", done: sourcedCount >= 1 },
    { label: "At least one falsifier recorded", done: falsifiers.length >= 1 },
    { label: "Linked to a market state or experiment", done: Boolean(context.marketState || context.experimentId) }
  ];
  const done = items.filter((item) => item.done).length;
  return {
    done,
    total: items.length,
    ratio: done / items.length,
    items,
    note: "Completeness is a checklist, not a measure of truth, rigor, or expected return."
  };
}

export function formatSignedPercent(value) {
  const rounded = round(value);
  return (rounded > 0 ? "+" : "") + String(rounded) + "%";
}
