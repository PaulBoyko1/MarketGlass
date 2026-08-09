# Decisions

| Decision | Status | Rationale |
| --- | --- | --- |
| Continue `codex/marketglass-foundation` | accepted | Preserves the draft PR and original notebook work |
| Node server plus native modules | accepted | Establishes a secure provider boundary without making Demo Mode depend on a complex build chain |
| Ship only synthetic data | accepted | Avoids redistributing market data under unclear personal-use terms |
| Keep a transparent raw-grid mesh baseline | accepted | Raw options points and quality warnings are more honest than an unvalidated SVI implementation |
| Black-Scholes as a local approximation | accepted with warning | Useful for a controlled research/sandbox calculation; equity/ETF options may be American-style and discrete dividends matter |
| No trading routes | accepted | MarketGlass remains a read-only research instrument |
| Past-only analogues and chronological split | accepted | Prevents the most obvious look-ahead and shuffled-time errors |
| Related-test counter and holdout panel | accepted | A small, visible defense against repeated exploratory testing |
| Keep notebook score as completeness only | accepted | Checklist completion is legible; it is not a measure of truth or rigor |
