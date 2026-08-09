# Current-State Audit

Audit date: 2026-08-09
Audited ref: `codex/marketglass-foundation`

## KEEP

- `logic.mjs` keeps scenario normalization, bounded numeric inputs, evidence validation, and escaped user-facing data as small, testable primitives.
- The evidence ledger distinguishes facts, inferences, assumptions, and catalysts, and preserves challenging evidence alongside support.
- Falsifiers remain a useful research habit and now support an optional structured monitor with an explicit field, operator, threshold, and observed state.
- Browser-local persistence remains appropriate for notebook drafts and user bookmarks.
- The existing Node test runner and Node 20/22 workflow are a good low-friction verification base.

## DEMOTE

- Bear/base/bull scenarios become one tool inside **Research Notebook**, not the opening experience.
- The belief map becomes a compact notebook visualization. It is not a market-state visualization and does not drive any conclusion.
- The original static site becomes a browser client served by a local API. It is no longer the boundary where data-provider keys or analytics live.

## REPLACE

- `research health` was a weighted heuristic that could be mistaken for scientific rigor. The UI now uses **note completeness**, an explicit checklist of balanced scenario weights, sourced evidence, counterevidence, falsifiers, and linked market evidence.
- The old workspace was thesis-first. The new home is session-first: price, participation, concentration, volatility, options, and time are inspectable before a user writes a note.
- The original belief-map y-axis wording was inverted relative to its conviction score. The new notebook makes the directional interpretation explicit and treats it as a ledger summary only.

## MISSING BEFORE THIS CONTINUATION

- A server-side provider boundary, server-only environment secrets, cache, rate-limit budget, and capability discovery.
- Demo and recorded sessions that let the complete instrument run with no API keys.
- Timestamp-aligned market internals, sector participation, volatility context, normalized option snapshots, options math, replay, surfaces, and provenance.
- A past-only analogue engine, structured hypothesis specification, chronological evaluation, full distributions, and multiple-testing warnings.
- A visual route from an observed time interval to an editable hypothesis.
- Reproducible experiment export, source documentation, explicit market-data licensing limits, and an API health interface.

## Preservation Plan

The original `logic.mjs` and `data.js` remain in the repository and are imported by the new Research Notebook module. Their scenario/evidence/falsifier concepts are extended with market-state links rather than discarded.
