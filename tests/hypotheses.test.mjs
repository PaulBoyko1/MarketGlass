import assert from "node:assert/strict";
import test from "node:test";

import {
  findAnalogues,
  proposeSpecFromObservation,
  runChronologicalExperiment,
  validateHypothesisSpec
} from "../src/core/hypotheses.mjs";

function historyRow(sequence) {
  return {
    sequence,
    timestamp: new Date(Date.UTC(2026, 0, 1, 14, 30 + sequence * 15)).toISOString(),
    features: {
      spyReturn30m: 0.4,
      rspSpyReturn30m: -0.2,
      breadthPct: 40 + sequence,
      ivChange: 0.01,
      realizedVol: 15,
      sectorDispersion: 0.5,
      relativeVolume: 1
    },
    targets: {
      forwardReturn60m: sequence % 2 === 0 ? 0.2 : -0.1,
      forwardRealizedVol60m: 0.3,
      forwardMaxAdverse60m: -0.2
    }
  };
}

const spec = {
  name: "Narrow participation",
  conditions: [
    { field: "spyReturn30m", operator: ">", threshold: 0.2 },
    { field: "rspSpyReturn30m", operator: "<", threshold: -0.1 }
  ],
  target: { field: "forwardReturn60m", horizonMinutes: 60 }
};

test("chronological experiments purge the forward horizon before the holdout and space events", () => {
  const history = Array.from({ length: 12 }, (_, index) => historyRow(index));
  const result = runChronologicalExperiment(history, spec, { trainFraction: 0.7, intervalMinutes: 15, relatedTests: 3, runTimestamp: "2026-08-09T00:00:00.000Z" });

  assert.equal(result.validation.embargo_steps, 4);
  assert.equal(result.validation.purged_train_rows, 4);
  assert.equal(result.validation.multiple_testing_risk, "elevated");
  assert.ok(result.train.events.every((row) => row.sequence < 4));
  assert.ok(result.holdout.events.every((row) => row.sequence >= 8));
  assert.ok(result.all.events.every((row, index, rows) => index === 0 || row.sequence - rows[index - 1].sequence >= 4));
  assert.equal(result.train.summary.n, result.train.values.length);
  assert.equal(result.holdout.summary.n, result.holdout.values.length);
  assert.match(result.validation.method, /chronological/);
});

test("historical analogues are strictly past-only and expose their distance decomposition", () => {
  const history = Array.from({ length: 8 }, (_, index) => historyRow(index));
  const selected = historyRow(5);
  const analogues = findAnalogues(history, selected, { limit: 8 });

  assert.ok(analogues.length > 0);
  assert.ok(analogues.every((row) => row.timestamp < selected.timestamp));
  assert.ok(analogues.every((row) => row.decomposition.length === 7));
  assert.ok(analogues.every((row, index, rows) => index === 0 || row.distance >= rows[index - 1].distance));
});

test("hypothesis validation refuses unsupported conditions and visual proposals use observable fields", () => {
  const invalid = validateHypothesisSpec({ conditions: [{ field: "futureReturn", operator: ">", threshold: 0 }], target: { field: "bad", horizonMinutes: 0 } });
  const proposal = proposeSpecFromObservation(
    { timestamp: "2026-01-01T14:30:00.000Z", spyReturn: 0.2, rspSpyReturn: 0.1, breadthPct: 60, ivChange: 0.001 },
    { timestamp: "2026-01-01T15:00:00.000Z", spyReturn: 0.8, rspSpyReturn: -0.2, breadthPct: 42, ivChange: 0.012 }
  );

  assert.equal(invalid.valid, false);
  assert.ok(proposal.conditions.every((condition) => !condition.field.toLowerCase().includes("forward")));
  assert.ok(proposal.conditions.find((condition) => condition.field === "ivChange").threshold <= 0.006);
  assert.equal(proposal.target.field, "forwardReturn60m");
});
