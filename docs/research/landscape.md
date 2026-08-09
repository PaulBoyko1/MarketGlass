# Landscape

MarketGlass is not positioned as a terminal replacement or a recommendation engine. It sits between data APIs, charting tools, and research notebooks.

| System category | What it does well | Boundary MarketGlass keeps visible |
| --- | --- | --- |
| Market-data APIs such as Massive and Twelve Data | Data retrieval, reference data, bars, and vendor-specific access | Provider tier, freshness, cache age, license mode, and normalized provenance remain visible after ingestion. |
| Brokerage/data APIs such as Tradier | Quotes, chains, and a development sandbox | MarketGlass is read-only and never exposes trading controls or requests trading permissions. |
| Historical data stores such as Cboe DataShop | Higher-quality historical option quotes, trades, OI, and derived data | Cost and redistribution constraints are explicit; demo never impersonates licensed data. |
| General charting products | Fast chart interaction and symbol discovery | A chart is only one dimension. MarketGlass synchronizes price with participation, concentration, volatility, options, and replay time. |
| Strategy/P&L tools | Scenario analysis of options positions | MarketGlass makes model, rate, dividend, IV, and remaining-time assumptions inspectable and connects scenarios to the observed market state. |
| Research notebooks | Capturing claims and caveats | MarketGlass lets evidence link back to a timestamp, selection, source, analogue, or experiment result. |

## Design Identity

The differentiator is not a proprietary signal. It is the chain:

`recorded or synthetic market state -> visual inspection -> editable structured hypothesis -> chronology-safe distribution -> evidence and falsifier record`

This design makes the two usually hidden parts of a market interface visible: data provenance and analytical uncertainty.

## Deliberate Non-Goals

- No broker, order entry, recommendation, price target, or bullish/bearish meter.
- No claimed dealer positioning from open interest alone.
- No public redistribution of personal-use market feeds.
- No option strategy backtest when historical quote quality is insufficient.
