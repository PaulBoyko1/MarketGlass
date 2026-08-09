# Development and Research Failures

## Near-expiry IV is not always a stable number

During fixture design, contracts very close to expiry and at intrinsic value made a naive IV inversion appear to converge toward arbitrary high or low values. The implementation now validates no-arbitrage bounds, rejects tiny time-to-expiry inputs, returns an explicit status, and omits unstable points from surface construction. This is a limitation of the observable input and model, not a missing value to paper over.

## A smooth surface can conceal sparse data

A first visual prototype made sparse wings look more certain than the raw contracts justified. The shipped surface keeps raw contract points enabled, grades coverage, and permits only validated quote-state contracts to shape the raw-grid mesh. Wide and invalid contracts remain visible rather than being silently discarded. It does not claim an arbitrage-free fitted surface.

## Current constituent membership is not historical breadth

The demo intentionally does not claim historical S&P constituent data. The implementation uses a synthetic participation fixture and reserves point-in-time constituent studies for an explicit premium data path.

## Synthetic experiment results are not evidence

The narrow-rally experiment is deterministic so the full workflow can run without a key. Its results are visibly labelled synthetic and descriptive; they are not presented as empirical support for a trade.

## A content security policy can break module setup

The app uses an import map for Three.js. A strict policy initially allowed the root document but not a direct request for `web/index.html`, leaving the nonce placeholder untouched. Static serving now routes both document paths through the nonce-aware response, and a server test verifies that the placeholder never escapes.

## A visible WebGL surface is not automatically testable

Direct WebGL pixel reads can be blank after the compositor presents a canvas. The renderer retains its drawing buffer and the browser test samples an offscreen 2D copy of the actual canvas. This verifies that desktop and mobile views contain non-background surface pixels without treating a screenshot as a data-quality check.
