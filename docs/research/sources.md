# Research Sources

Last reviewed: 2026-08-09. Product access, licensing, plan names, and pricing can change; the README repeats the setup guidance with the same verification date.

## Primary Market-Data Sources

- [Massive pricing](https://massive.com/pricing?product=options) and [Stocks API overview](https://massive.com/docs/rest/stocks/overview): on this review date, Options Basic listed 5 calls/minute, two years, and EOD/reference/minute aggregates; Starter listed 15-minute delayed snapshots plus real-time IV/Greeks and daily OI. Access and individual-use terms remain plan-gated.
- [Massive Options API overview](https://massive.com/docs/rest/options/overview?auth=signup): contract reference, aggregate, snapshot, trade, quote, and plan-gated endpoint descriptions.
- [Tradier market data](https://docs.tradier.com/docs/market-data) and [endpoints](https://docs.tradier.com/docs/endpoints): documentation distinguishes delayed sandbox equity/options data from brokerage market data and says sandbox Greeks are unavailable while brokerage Greeks are hourly.
- [Twelve Data individual pricing](https://twelvedata.com/pricing): on this review date, Basic listed 8 API credits/minute and 800/day, together with personal/internal/non-commercial restrictions.
- [FRED API overview](https://fred.stlouisfed.org/docs/api/fred/overview.html), [series observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html), and [FRED/ALFRED documentation](https://fred.stlouisfed.org/docs/api/fred/index.html): registered-key REST access, JSON response support, and vintage-aware macro data.
- [Cboe historical options data](https://www.cboe.com/us/options/market_statistics/historical_data/), [Cboe DataShop](https://datashop.cboe.com/), and [Cboe VIX product page](https://www.cboe.com/en/tradable-products/vix/vix-options/): public archives, paid historical options paths, and VIX context.
- [Alpha Vantage premium page](https://www.alphavantage.co/premium/): on this review date, standard free use was advertised at 25 requests/day; real-time US/options access is an entitlement decision, not inferred from a generic key.

## Options and Quantitative Sources

- [OCC options disclosure document](https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document): standardized-options risk, exercise, and contract caveats. MarketGlass labels its Black-Scholes calculations as a European-style approximation; it does not treat ETF equity options as fully modeled European contracts.
- [Cboe VIX methodology](https://cdn.cboe.com/api/global/us_indices/governance/Volatility_Index_methodology_VIXMO_only.pdf): the VIX-family methodology is model-independent and represents an option-implied volatility measure, not a directional trading signal.
- [Gatheral and Jacquier, *Arbitrage-free SVI volatility surfaces*](https://arxiv.org/abs/1204.0646): reference for why a sophisticated fitted surface requires arbitrage constraints. The demo intentionally uses a raw grid mesh with quality diagnostics rather than claiming SVI calibration.
- [Harvey, Liu, and Zhu, *...and the Cross-Section of Expected Returns*](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2249314): motivation for tracking related tests and preserving an untouched chronological holdout.

## Implementation Decisions Informed by the Sources

- No provider data is embedded in the public demo. The shipped fixture is deterministic and synthetic.
- Free-plan capabilities are declared conservatively and exposed in the UI. They are not inferred from documentation alone at runtime.
- Vendor IV/Greeks remain distinct from MarketGlass model values.
- The demo uses raw option points plus a deliberately simple grid mesh. It displays quality checks and does not claim a production arbitrage-free surface.
