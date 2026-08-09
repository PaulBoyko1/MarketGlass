# Interview Notes

- **Why it exists:** Market tools often show price as the story. MarketGlass makes time, participation, concentration, volatility, options assumptions, and uncertainty inspectable together, then lets a user turn a visual observation into an auditable test.
- **Architecture:** A local Node API owns provider configuration, caching, rate budgets, normalizing, math, recording, session hashing, and experiments. The browser owns rendering, WebGL interaction, selection, and replay.
- **Hardest data issue:** Free data tiers rarely provide historical, timestamp-aligned option quotes, OI, IV, Greeks, and point-in-time index membership together. Demo Mode is synthetic by design; premium data is documented as a real requirement for some research.
- **Options assumption:** Local Black-Scholes values are labeled European-style approximations. MarketGlass records rate, dividend yield, remaining time, quote midpoint, and convergence state; it does not treat this as an American-option pricing engine.
- **Bias safeguard:** Past-only analogue filtering, chronological splits, an untouched holdout, a related-test counter, and optionally structured falsifier monitors are built into the workflow.
- **Visualization tradeoff:** The three surfaces are actual interactive Three.js views with raw point overlays. A raw grid mesh was chosen over pretending an untested SVI fit is institutional grade.
- **A real failure:** IV inversion near expiry becomes numerically unstable around intrinsic bounds. The app returns a labeled missing/unstable value instead of manufacturing an IV.
- **Current limitation:** Demo results are synthetic; a serious historical options study needs licensed quote/contract/OI history and documented point-in-time constituents.
