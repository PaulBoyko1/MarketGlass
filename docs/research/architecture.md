# Architecture

## Chosen Stack

MarketGlass uses a local Node.js HTTP service plus native browser ES modules and Three.js. This is intentionally smaller than a framework-heavy SPA while still providing a real client/server boundary:

```text
web/                         rendering, selection state, replay controls, WebGL
src/server.mjs               local API and static serving
src/providers/               server-only keys, capability detection, cache, rate budgets
src/core/                    schemas, options math, market analytics, replay, analogues, tests
src/store/                   local recorded-session persistence
records/                     local user-generated recordings (ignored except for .gitkeep)
```

## Why This Rather Than a Browser-Only App

- Provider keys remain in `process.env`; the browser receives only configuration status and safe capabilities.
- Provider calls, cache TTL, rate budgets, normalized schemas, and recording stay server-side.
- Demo and recorded mode use the same analysis API contract, including a content hash on every resolved session.
- Native modules keep the demo easy to inspect and run while the local server supplies secure routes.

## Data Modes

- `demo`: generated deterministic session with `is_synthetic: true` on every response.
- `recorded`: a local JSON recording made through the API; it includes metadata, data hash, capture time, and source labels.
- `free`: selected mode currently returns an explicit `503 synchronized_session_unavailable`. The provider adapters, capability inspection, cache, and rate budgets are present, but a licensed synchronized collection pipeline is intentionally not shipped as a fake-live fallback.
- `premium`: also returns the same explicit unavailable state until a licensed collector is configured. A key alone never implies premium entitlement or a complete session.

## Reproducibility

Resolved sessions receive a stable SHA-256 data hash. Experiments return that hash, the editable specification, run timestamp, and software identifier. Recordings verify their own SHA-256 hash before use. All state matching is timestamp-based, never row-number based.

## Surface Choice

The demo renders only validated strike-expiry points into a transparent mesh, while all quote states remain inspectable in the raw-point overlay. Missing grid cells use a visibly disclosed baseline fill rather than an implied fitted model. The renderer is neither SVI/SSVI calibrated nor arbitrage-free. Surface-quality diagnostics respect the selected contract type and flag sparse coverage and simple calendar-total-variance violations.
