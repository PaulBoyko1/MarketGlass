import assert from "node:assert/strict";
import test from "node:test";

import {
  describeScenarios,
  evaluateNotebookCompleteness,
  evaluateResearch,
  scoreEvidence,
  validateEvidenceDraft
} from "../logic.mjs";

test("scenario math preserves a balanced probability distribution", () => {
  const summary = describeScenarios([
    { key: "bear", probability: 50, returnPct: -20 },
    { key: "base", probability: 30, returnPct: 12 },
    { key: "bull", probability: 20, returnPct: 60 }
  ]);

  assert.equal(summary.totalProbability, 100);
  assert.equal(summary.expectedReturn, 5.6);
  assert.equal(summary.isBalanced, true);
  assert.equal(summary.downside, -20);
  assert.equal(summary.upside, 60);
});

test("scenario math bounds malformed values and reports unbalanced weights", () => {
  const summary = describeScenarios([
    { key: "bear", probability: -50, returnPct: -200 },
    { key: "base", probability: 80, returnPct: 10 },
    { key: "bull", probability: 90, returnPct: 2000 }
  ]);

  assert.equal(summary.totalProbability, 170);
  assert.equal(summary.isBalanced, false);
  assert.equal(summary.downside, -100);
  assert.equal(summary.upside, 1000);
});

test("evidence scoring retains both supporting and challenging claims", () => {
  const evidence = scoreEvidence([
    {
      title: "Renewals increased through the last three periods.",
      source: "Filing",
      kind: "fact",
      direction: "support",
      confidence: 90
    },
    {
      title: "Margins rely on a pricing assumption.",
      source: "Model",
      kind: "assumption",
      direction: "challenge",
      confidence: 55
    }
  ]);

  assert.equal(evidence.count, 2);
  assert.equal(evidence.supportingCount, 1);
  assert.equal(evidence.challengeCount, 1);
  assert.equal(evidence.kinds.length, 2);
  assert.ok(evidence.conviction > 50);
  assert.ok(evidence.conviction < 100);
});

test("draft validation prevents vague or out-of-range evidence", () => {
  const invalid = validateEvidenceDraft({
    title: "No",
    source: "x".repeat(121),
    confidence: 101
  });

  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 3);
});

test("research health rewards balance, diversity, tension, and falsifiers", () => {
  const strong = evaluateResearch(
    [
      { key: "bear", probability: 25, returnPct: -20 },
      { key: "base", probability: 50, returnPct: 12 },
      { key: "bull", probability: 25, returnPct: 50 }
    ],
    [
      {
        title: "Retention held through a difficult comparison period.",
        source: "Filing",
        kind: "fact",
        direction: "support",
        confidence: 80
      },
      {
        title: "The price change may reduce renewal volume.",
        source: "Research",
        kind: "inference",
        direction: "challenge",
        confidence: 60
      },
      {
        title: "A product release could improve conversion.",
        source: "Roadmap",
        kind: "catalyst",
        direction: "support",
        confidence: 55
      }
    ],
    ["Retention declines below the prior-year cohort.", "Launch timing slips by two quarters."]
  );
  const weak = evaluateResearch([], [], []);

  assert.ok(strong.score > weak.score);
  assert.equal(strong.label, "Structured");
  assert.equal(strong.falsifierCount, 2);
});

test("notebook completeness remains an explicit checklist rather than a research-quality score", () => {
  const completeness = evaluateNotebookCompleteness(
    [
      { key: "bear", probability: 25, returnPct: -10 },
      { key: "base", probability: 50, returnPct: 8 },
      { key: "bull", probability: 25, returnPct: 24 }
    ],
    [
      { title: "Participation is broad.", source: "Fixture", kind: "fact", direction: "support", confidence: 70 },
      { title: "Leadership is concentrated.", source: "Fixture", kind: "fact", direction: "challenge", confidence: 70 }
    ],
    [{ text: "Breadth falls below 45 percent." }],
    { marketState: { timestamp: "2026-08-10T14:00:00.000Z" } }
  );

  assert.equal(completeness.done, completeness.total);
  assert.match(completeness.note, /not a measure of truth/);
});
