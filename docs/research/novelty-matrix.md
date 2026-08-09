# Novelty Matrix

This is a design comparison, not a claim that every external product lacks every feature. Public product pages and API documentation were reviewed on 2026-08-09; feature availability changes.

| System / category | Internals | Normalized option chain | IV surface | Intraday replay | Past-only analogues | Structured test | Assumption sensitivity | Provenance visible |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Massive API | Data primitives | Endpoint dependent | Data/model dependent | Client-built | Client-built | Client-built | Client-built | API response metadata |
| Tradier API | Quotes and chains | Yes, endpoint data | Vendor/model dependent | Client-built | Client-built | Client-built | Client-built | API response metadata |
| Cboe DataShop | Dataset dependent | Yes, paid datasets | Dataset/model dependent | Dataset dependent | Client-built | Client-built | Client-built | Dataset licensing required |
| General charting platform | Often strong | Varies | Varies | Varies | Usually workflow-specific | Usually limited | Usually hidden | Varies |
| Strategy scenario tool | Limited | Usually position-specific | Varies | Usually limited | No | No | Usually model inputs | Varies |
| **MarketGlass** | Demo-backed synchronized breadth, sectors, concentration, and vol | Yes | Raw points plus transparent grid mesh | Yes, deterministic demo/recorded session | Yes, past-only default | Yes, editable conditions and chronological holdout | Gamma and P&L modes label assumptions | First-class provenance badge/inspector |

## What MarketGlass Adds

1. A shared clock across price, participation, sectors, options, and notebook links.
2. A direct visual-selection to hypothesis workflow that shows compiled conditions before a test runs.
3. An uncertainty-first result panel: distribution, sample size, interval, chronological holdout, and related-test count.
4. A gamma interface that illustrates how the same OI can produce different signed views under different assumptions.
