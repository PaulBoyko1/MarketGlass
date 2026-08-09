# MarketGlass

MarketGlass is an offline, evidence-first market-research workbench. It is built to make uncertainty visible rather than conceal it behind a single price target.

**Educational prototype only.** It does not provide investment advice, execute trades, or fetch live market data.

## What it does

- Models bear, base, and bull cases with explicit probabilities and returns.
- Computes a scenario-weighted expected return while warning when the weights do not total 100%.
- Keeps an editable evidence ledger that separates facts, inferences, assumptions, and catalysts.
- Preserves claims that challenge a thesis, not merely the claims that support it.
- Tracks falsifiers: conditions that would weaken or invalidate the current research note.
- Persists the workspace only in the browser through local storage.
- Includes a canvas belief map that visualizes expected return and evidence conviction.

## Reasoning model

A good research note should be able to answer:

1. What outcomes are possible?
2. How likely is each outcome?
3. Which claims are established, inferred, or assumed?
4. What evidence contradicts the thesis?
5. What observation would make the researcher revise the view?

MarketGlass turns those questions into an editable workbench. The research-health score measures process completeness, not investment quality.

## Run locally

No package installation is required. Serve the repository from any static HTTP server, for example:

    python -m http.server 8080

Then visit http://localhost:8080.

## Engineering

The research calculations live in logic.mjs, separate from the browser UI, and are covered by Node's built-in test runner. GitHub Actions validates syntax and logic tests on Node 20 and Node 22.

## Project status

This foundation is on the codex/marketglass-foundation branch with a draft pull request for review.
