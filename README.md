# MarketGlass

MarketGlass is a local-first market-state microscope, options laboratory, and hypothesis-testing workbench. It starts with a synchronized session view rather than a thesis: price, equal-weight participation, breadth, concentration, sector behavior, volatility, options assumptions, and replay time are inspected together before an observation can become a test.

**Research and education software only.** MarketGlass does not provide investment advice, execute orders, issue price targets, or turn model output into a recommendation. The bundled data is a deterministic synthetic fixture, not delayed or live market data.

## What Is Shipped

- A session-first workbench for a deterministic 15-minute SPY/RSP/breadth/concentration/sector/volatility fixture.
- A synchronized replay cursor, time comparison, bookmarks, local recordings, and explicit provenance.
- An options lab with a normalized-chain schema, modeled Greeks/IV checks, 3D raw-grid views, 0DTE time behavior, gamma assumption scenarios, and P&L sensitivity.
- A visual-observation-to-hypothesis flow: compile editable conditions, inspect them before execution, run a chronological split, inspect the full distribution and untouched holdout, then export the result as JSON.
- Past-only analogue lookup and a preserved scenario/evidence/falsifier notebook with optional structured falsifier monitors.
- Server-only provider configuration, capability discovery, cache/rate-budget primitives, normalized Massive and Tradier option-chain adapters, FRED and Twelve Data adapters, recordings with integrity checks, tests, and CI.

The original scenario notebook is intentionally retained under **Research Notebook**. It is no longer the opening experience because note completeness is not evidence of a valid market conclusion.

## Quick Start

MarketGlass requires Node.js 20 or newer. Node 20 and 22 are exercised by CI.

```bash
npm ci
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The zero-key default is Demo Mode, so the entire workbench starts without a provider account.

To run the full local verification stack:

```bash
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run test:all` runs the four validation commands after Chromium has been installed.

## A Short Tour

1. **Market state**: scrub or play the shared 15-minute clock. Compare SPY with RSP, breadth, concentration, sector dispersion, volume, realized volatility, VIX context, and option IV context at the same timestamp.
2. **Options lab**: inspect the raw contracts and their quote state. The IV, 0DTE, and P&L surfaces are interactive Three.js views with raw points and a reset-camera control; the mesh is a visual baseline, not a fitted arbitrage-free surface.
3. **Formalize observation**: choose a visible start and end interval, then review the generated conditions and target in Hypothesis Lab before running it.
4. **Hypothesis lab**: run the chronology-safe fixture experiment, inspect sample count, mean, median, interval, distribution, train/holdout split, and multiple-testing warning. Exporting captures the spec, data hash, result, and run metadata.
5. **Research notebook**: add evidence, counterevidence, scenarios, and falsifiers that link to the selected market time or latest experiment. A structured falsifier can monitor a chosen field, operator, and threshold rather than remaining only prose.

## Data Modes And Honesty Rules

| Mode | Works now | What it is | What MarketGlass refuses to do |
| --- | --- | --- | --- |
| `demo` | Yes, zero keys | A deterministic, coherent synthetic session with `is_synthetic: true` provenance | Call it live, delayed, or vendor data |
| `recorded` | Yes | A locally saved Demo session with capture metadata and a verified SHA-256 integrity hash | Alter a corrupted recording silently |
| `free` | Intentionally unavailable | A future synchronized session path using declared free-tier capabilities | Substitute the synthetic fixture while labeling it free-provider data |
| `premium` | Intentionally unavailable | A future licensed synchronized session path | Infer entitlement, redistribution rights, or complete coverage merely from a key |

Selecting Free or Premium currently returns a visible `503 synchronized_session_unavailable` state. That is deliberate: adapters and capability inspection exist, but a licensed collector for timestamp-aligned bars, internals, options, and historical research data is not yet shipped. There is no fake-live fallback.

Every resolved session carries provenance and a stable data hash. Recorded sessions verify their file hash before they are loaded. Provider keys stay in the Node process and are never returned to the browser.

## Provider Setup And Current Access

Copy the example only when you are preparing a private local integration:

```bash
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env`. Leave `MARKETGLASS_DATA_MODE=demo` until a licensed synchronized collector is implemented. Never commit `.env`; it is ignored by Git.

The following access facts were last verified on **2026-08-09** from the linked official pages. Prices, plan names, limits, and redistribution terms can change, so recheck them before deploying or displaying provider data.

| Provider | Environment variables | Verified access route | Current integration boundary |
| --- | --- | --- | --- |
| [Massive](https://massive.com/pricing?product=options) (formerly Polygon.io) | `MASSIVE_API_KEY`, `MASSIVE_PLAN`, `MASSIVE_CALLS_PER_MINUTE` | Options Basic was listed at $0 with 5 calls/minute, two years, and EOD/reference/minute aggregates. Starter was listed at $29/month with 15-minute delayed snapshots, real-time IV/Greeks, and daily OI; higher plans list broader real-time access. | Server option-chain adapter and canonical normalizer; plan capability is explicit. The local request budget defaults to 5 and must be set no higher than the holder's plan. `POLYGON_API_KEY` remains only as a legacy fallback. |
| [Tradier](https://docs.tradier.com/docs/market-data) | `TRADIER_SANDBOX_TOKEN` or `TRADIER_TOKEN` | The sandbox documents delayed equities/options and no Greeks. Brokerage market data documents real-time equities/options and hourly Greeks under its terms. | Read-only option-chain adapter; no accounts, orders, or trading controls. |
| [Twelve Data](https://twelvedata.com/pricing) | `TWELVE_DATA_API_KEY`, `TWELVE_DATA_CREDITS_PER_MINUTE` | Basic was listed as free with 8 API credits/minute and 800/day, with individual/personal/internal/non-commercial limitations. | Server adapter, cache/rate-budget boundary, and provider health reporting. |
| [FRED](https://fred.stlouisfed.org/docs/api/fred/overview.html) / [ALFRED](https://fred.stlouisfed.org/docs/api/fred/index.html) | `FRED_API_KEY` | The key-based REST API supports JSON; [series observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) also supports vintage-aware research workflows. | Server macro adapter. The Demo rate is an explicitly configured fixture constant, not hidden FRED data. |
| [Cboe](https://www.cboe.com/us/options/market_statistics/historical_data/) / [DataShop](https://datashop.cboe.com/) | None in this build | Public statistics and paid historical options products are separate routes with their own terms. | No scraping and no Cboe data embedded in the demo. |
| [Alpha Vantage](https://www.alphavantage.co/premium/) | None in this build | Standard free use was listed at 25 requests/day; US real-time/options entitlement is not assumed. | Evaluated as a possible future fallback, not an active provider adapter. |

See [the detailed provider matrix](docs/research/data-provider-matrix.md) and [source notes](docs/research/sources.md) before connecting any data source.

## Architecture

```text
browser ES modules + Three.js
        |
        | local HTTP API (no keys in browser)
        v
provider registry / cache / rate budgets / normalizers
        |
        +-- deterministic demo session
        +-- verified local recordings
        +-- future licensed synchronized collector
        |
analytics: market state, options math, replay, gamma, P&L,
           past-only analogues, chronological experiments
```

- `src/server.mjs` serves the application, enforces a strict nonce-based content security policy, exposes the local API, and rejects traversal paths.
- `src/providers/` contains provider-specific code, safe error shapes, request cache/rate-budget primitives, and option normalization.
- `src/core/` contains schema validation, Black-Scholes-based sandbox calculations, market-state metrics, replay, gamma scenarios, and hypothesis methods.
- `src/store/recordings.mjs` stores local recorded sessions and verifies their integrity on read.
- `web/` is the instrument-style client. It has no provider secrets and sends only mode/recording selection to the local API.

More detail is in [architecture.md](docs/research/architecture.md) and [decisions.md](docs/research/decisions.md).

## Quantitative Methodology And Limits

### Market State

The demo aligns every panel to a single 15-minute timestamp. SPY, RSP, QQQ, SMH, synthetic breadth, sector values, concentration, realized-volatility context, VIX context, and option snapshots are generated together. The fixture makes a narrow-rally narrative inspectable; it does not assert point-in-time index constituents or empirical historical market behavior.

### Options

Option records have a normalized contract schema with bid, ask, midpoint, quote status, open interest, volume, IV/Greek provenance, and a market timestamp. Black-Scholes calculations are clearly labeled as a European-style approximation. ETF/equity options can be American-style, may have discrete-dividend effects, and near-expiry implied-volatility inversion can be unstable. The app validates basic no-arbitrage bounds, exposes unstable values instead of inventing them, and keeps vendor values distinct from model values.

The IV surface is a raw strike-expiry grid mesh with raw-point overlay, axis guide, reset camera, coverage count, and a simple calendar-total-variance diagnostic. Only `valid` quote-state observations feed the mesh; wide or invalid contracts stay visible as colored raw points but do not manufacture the shape. It is not SVI/SSVI calibration, does not prove static-arbitrage freedom, and should not be interpreted as such. The gamma panel exposes unsigned OI-plus-Greek magnitude and alternate sign assumptions because open interest does not reveal dealer inventory or hedging. The P&L view is a sensitivity scenario, not a forecast.

### Hypotheses And Analogues

The observation workflow generates an editable structured condition set. Experiments use chronology rather than shuffled samples, purge the forward horizon before holdout, report the full observed distribution, calculate a simple interval where sample size permits, and surface the related-test count. Analogues are limited to prior timestamps by default. These guards reduce obvious leakage and exploratory overstatement; they do not create causal inference, solve multiple-comparison problems, or turn a synthetic fixture into evidence.

The [quantitative claims register](docs/research/quantitative-claims.md) classifies what each concept means and what it does not establish. The [failures log](docs/failures.md) records known numerical, visualization, data-quality, and test pitfalls.

## Research Trail

- [Current-state audit](docs/research/current-state-audit.md)
- [Landscape](docs/research/landscape.md)
- [Novelty matrix](docs/research/novelty-matrix.md)
- [Data-provider matrix](docs/research/data-provider-matrix.md)
- [Quantitative claims](docs/research/quantitative-claims.md)
- [Architecture](docs/research/architecture.md)
- [Decisions](docs/research/decisions.md)
- [Primary sources](docs/research/sources.md)
- [Development and research failures](docs/failures.md)
- [Interview notes](docs/interview-notes.md)

## Verification

The test suite covers schemas, option math, replay invariants, deterministic market state, chronological hypothesis behavior, provider safety/normalization, recordings, static/API security behavior, the preserved notebook logic, and browser flows. Playwright checks both desktop and mobile layouts; its WebGL assertions sample the rendered canvas to confirm the interactive surfaces are actually nonblank.

The repository's GitHub Actions workflow runs syntax checks, tests, and the build on Node 20 and 22, then runs Chromium browser tests on Node 22.

## Project Scope

MarketGlass is a research instrument, not a terminal replacement. It deliberately omits brokerage routing, trade execution, provider-data redistribution, price targets, directional meters, and claimed dealer positioning. A real historical options study still requires licensed timestamp-aligned quotes, contract metadata, OI, a documented rate/dividend process, and point-in-time constituent membership.
