export const starterState = Object.freeze({
  scenarios: [
    { key: "bear", label: "Bear", probability: 25, returnPct: -28 },
    { key: "base", label: "Base", probability: 50, returnPct: 14 },
    { key: "bull", label: "Bull", probability: 25, returnPct: 52 }
  ],
  evidence: [
    {
      id: "evidence-market-size",
      title: "Retention improved for three consecutive reporting periods.",
      source: "Quarterly filing",
      kind: "fact",
      direction: "support",
      confidence: 82
    },
    {
      id: "evidence-pricing",
      title: "The unit economics depend on price increases holding.",
      source: "Research note",
      kind: "assumption",
      direction: "challenge",
      confidence: 64
    },
    {
      id: "evidence-catalyst",
      title: "A new product release could widen the addressable market.",
      source: "Product roadmap",
      kind: "catalyst",
      direction: "support",
      confidence: 56
    }
  ],
  falsifiers: [
    "Net retention falls below the prior-year cohort after the next two reports.",
    "The product launch slips beyond the stated planning window."
  ]
});

export const learningSteps = Object.freeze([
  {
    number: "01",
    title: "Separate outcomes from certainty",
    copy: "A thesis is not a single price target. It is a set of possible outcomes and the weights you assign to them."
  },
  {
    number: "02",
    title: "Label the kind of evidence",
    copy: "A filing, an inference, an assumption, and a catalyst should not carry the same authority."
  },
  {
    number: "03",
    title: "Invite disconfirming evidence",
    copy: "A useful research record includes claims that could weaken the thesis, not only the claims that support it."
  },
  {
    number: "04",
    title: "Track what would change your mind",
    copy: "Falsifiers turn a vague warning into an observable condition that can be monitored over time."
  }
]);

export const glossary = Object.freeze([
  {
    term: "Scenario-weighted return",
    definition: "The probability-weighted average of the returns across several possible outcomes.",
    application: "MarketGlass uses it to keep a base case from hiding the cost of a bear case."
  },
  {
    term: "Evidence ledger",
    definition: "A list of claims with their source, type, direction, and confidence rather than a pile of unstructured notes.",
    application: "MarketGlass makes support and challenge evidence visible side by side."
  },
  {
    term: "Falsifier",
    definition: "An observation that would materially weaken or invalidate a thesis.",
    application: "MarketGlass records falsifiers as concrete conditions to monitor."
  },
  {
    term: "Base rate",
    definition: "The relevant historical frequency before considering a specific story or company.",
    application: "Use it before increasing an optimistic scenario weight."
  },
  {
    term: "Catalyst",
    definition: "A future event that could cause the market to revisit expectations.",
    application: "MarketGlass labels catalysts separately from established facts."
  },
  {
    term: "Conviction",
    definition: "A summary of how the current evidence ledger leans, not a measure of objective truth.",
    application: "MarketGlass reports a directional score while preserving the opposing evidence."
  }
]);
