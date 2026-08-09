# Data Provider Matrix

Last verified: 2026-08-09. This table is an integration guide, not a redistribution license. Users must review provider terms before deployment or display of received data.

| Provider | Key | Current no-cost path | Useful modules | What an upgrade changes | MarketGlass handling |
| --- | --- | --- | --- | --- | --- |
| Massive (formerly Polygon.io) | `MASSIVE_API_KEY`, `MASSIVE_PLAN`, `MASSIVE_CALLS_PER_MINUTE` | Stocks/Options Basic: 5 calls/minute, 2 years, end-of-day/reference and minute aggregates listed by Massive | Equity history, reference, option contract discovery | Starter/Developer/Advanced add larger historical depth, delayed or real-time data, snapshots, IV/Greeks/OI, trades/quotes depending plan | Server adapter exposes plan-gated capabilities; the local budget defaults to 5 and must be configured no higher than the holder's plan. `POLYGON_API_KEY` is legacy fallback only |
| Tradier | `TRADIER_SANDBOX_TOKEN` or `TRADIER_TOKEN` | Sandbox is delayed for equities/options; Greeks unavailable in sandbox per documentation | Delayed option chain, quote/expiration development path | Brokerage account gives real-time equities/options and hourly Greeks under documented terms | Read-only adapter; no account or order endpoints are implemented |
| Twelve Data | `TWELVE_DATA_API_KEY` | Basic currently lists 8 API credits/minute, 800/day, with personal/internal/non-commercial use limits | SPY/RSP/sectors and raw underlying fallback | More credits, display rights, additional markets/datasets | Server-side budget and cache; visible freshness/provenance |
| FRED / ALFRED | `FRED_API_KEY` | Key-based public macro-series API | Risk-free rate and macro context | Not a real-time options feed | Adapter distinguishes FRED latest values from ALFRED vintage-aware historical use |
| Cboe public archives | none in this build | Historical options volume resources and VIX-family context where terms permit | Volatility context, volume references | DataShop offers paid historical options, quote, trade, and EOD products | No fragile scraping; no Cboe data is bundled in the demo |
| Alpha Vantage | none in this build | Standard access is currently advertised with 25 requests/day | Evaluated optional EOD/macro fallback | Premium gives higher throughput and premium real-time/options access | Research reference only; no active adapter or environment variable is shipped |

## Fallback Order

| Need | Priority | Visibility rule |
| --- | --- | --- |
| Current underlying / ETFs | Tradier -> Twelve Data -> Massive -> cache -> demo | The provenance inspector names the provider and freshness; no silent substitution |
| Options chain | Massive plan with snapshot capability -> Tradier -> explicit unavailable state | The provider endpoint names an unavailable configuration. The shipped session workbench remains clearly synthetic until a synchronized collector is added. |
| Rates | FRED adapter -> documented configured constant -> demo | The demo calculation records its configured constant. FRED is a server adapter for a future synchronized session pipeline, not silently mixed into the fixture. |

## Point-in-Time Constituents

The demo breadth/concentration values are synthetic. Real historical breadth needs historical membership and weights. MarketGlass labels any later implementation using current membership as `CURRENT-CONSTITUENT PROXY - SURVIVORSHIP BIAS POSSIBLE`. A point-in-time constituent dataset is a premium data decision, not an invisible approximation.
