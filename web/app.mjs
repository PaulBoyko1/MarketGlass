import { renderDistribution, renderGammaChart, renderMarketChart } from "./charts.mjs";
import { createNotebook } from "./notebook.mjs";
import { SurfaceView } from "./surfaces.mjs";

const state = {
  session: null,
  health: null,
  index: 16,
  marketState: null,
  view: "market",
  optionsView: "chain",
  observation: { start: 12, end: 18 },
  comparison: { left: 8, right: 20 },
  filters: { expiration: "2026-08-10", type: "both", strikeWindow: "all" },
  hypothesis: {
    name: "Equal-weight participation divergence",
    conditions: [
      { field: "spyReturn30m", operator: ">", threshold: 0.25 },
      { field: "rspSpyReturn30m", operator: "<", threshold: -0.08 },
      { field: "breadthPct", operator: "<", threshold: 47 }
    ],
    target: { field: "forwardReturn60m", horizonMinutes: 60 }
  },
  relatedTests: 0,
  experiment: null,
  analogues: [],
  playing: false,
  speed: 1,
  surfaces: {},
  notebook: null,
  marketStateRequest: 0,
  recordings: [],
  recordingId: null
};

const fieldLabels = {
  spyReturn30m: "SPY 30m return (%)",
  rspSpyReturn30m: "RSP minus SPY 30m return (pp)",
  breadthPct: "Positive breadth (%)",
  ivChange: "ATM IV change (decimal)",
  realizedVol: "Realized volatility (%)",
  sectorDispersion: "Sector dispersion",
  relativeVolume: "Relative volume"
};

const targetLabels = {
  forwardReturn60m: "SPY next 60m return (%)",
  forwardRealizedVol60m: "SPY next 60m realized volatility (%)",
  forwardMaxAdverse60m: "SPY next 60m max adverse excursion (%)"
};

const BOOKMARK_STORAGE_KEY = "marketglass-bookmarks-v1";

function $(selector) {
  return document.querySelector(selector);
}

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Local MarketGlass API request failed.");
  }
  return payload;
}

function setStatus(message) {
  $("#save-status").textContent = message;
}

function readBookmarks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      localStorage.removeItem(BOOKMARK_STORAGE_KEY);
    } catch {
      // Storage can be disabled by the browser; an in-memory empty list is still usable.
    }
    return [];
  }
}

function formatPercent(value, digits = 2, suffix = "%") {
  if (!Number.isFinite(Number(value))) return "n/a";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(digits)}${suffix}`;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "n/a";
}

function etTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
}

function etDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}

function currentTick() {
  return state.session.timeline[state.index];
}

function currentChain() {
  return state.session.optionSnapshots[currentTick().timestamp] ?? [];
}

function sessionParams() {
  const params = new URLSearchParams({ mode: state.session.mode });
  if (state.recordingId) params.set("recording", state.recordingId);
  return params;
}

function sessionBody() {
  return state.recordingId ? { dataMode: state.session.mode, recording: state.recordingId } : { dataMode: state.session.mode };
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.toggleAttribute("aria-current", active);
  });
  if (view === "options") renderOptions();
  if (view === "hypothesis") renderHypothesis();
  if (view === "notebook") state.notebook?.setContext({ marketState: state.marketState, experimentId: state.experiment?.experiment_id ?? null });
  if (view === "sources") renderSources();
}

function setOptionsView(view) {
  state.optionsView = view;
  document.querySelectorAll("[data-options-view]").forEach((panel) => {
    panel.hidden = panel.dataset.optionsView !== view;
  });
  document.querySelectorAll("[data-options-panel]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.optionsPanel === view);
  });
  if (view === "iv") renderIvSurface();
  if (view === "odte") renderOdteSurface();
  if (view === "gamma") renderGamma();
  if (view === "pnl") renderPnl();
}

async function refreshMarketState(index = state.index) {
  const requestId = ++state.marketStateRequest;
  const params = sessionParams();
  params.set("index", String(index));
  const response = await api(`/api/analysis/state?${params.toString()}`);
  if (requestId !== state.marketStateRequest || index !== state.index) return null;
  state.marketState = response.state;
  return response.state;
}

async function setIndex(index, { pause = false } = {}) {
  const next = Math.max(0, Math.min(state.session.timeline.length - 1, Number(index)));
  if (!Number.isInteger(next)) return;
  state.index = next;
  if (pause) state.playing = false;
  $("#timeline-range").value = String(next);
  const marketState = await refreshMarketState(next);
  if (!marketState) return;
  renderCurrent();
  if (state.view === "options") renderOptions();
  if (state.view === "notebook") state.notebook?.setContext({ marketState: state.marketState, experimentId: state.experiment?.experiment_id ?? null });
}

function renderTopbar() {
  const tick = currentTick();
  $("#mode-badge").textContent = `${state.session.mode.toUpperCase()} / ${state.session.provenance.is_synthetic ? "SYNTHETIC" : "PROVIDER"}`;
  $("#market-clock").textContent = `${etTime(tick.timestamp)} ET`;
  $("#market-date").textContent = etDate(tick.timestamp);
  $("#session-title-value").textContent = state.session.title;
  $("#session-subtitle").textContent = `${state.session.interval_minutes}-minute synchronized snapshots`;
  $("#timeline-selected").textContent = `${etTime(tick.timestamp)} ET`;
  $("#timeline-start").textContent = etTime(state.session.timeline[0].timestamp);
  $("#timeline-end").textContent = etTime(state.session.timeline.at(-1).timestamp);
  $("#play-button").textContent = state.playing ? "Pause" : "Play";
  $("#data-mode-select").value = state.session.mode === "recorded" ? "recorded" : "demo";
  $("#market-provenance").textContent = `${tick.provenance.is_synthetic ? "SYNTHETIC" : tick.provenance.source_provider} / ${tick.provenance.freshness}`;
}

function renderMarketState() {
  renderMarketChart($("#market-chart"), state.session, state.index, state.observation, (index) => {
    if (index !== state.index) setIndex(index);
  });
  const readout = $("#state-readout");
  const rows = [
    ["SPY session return", formatPercent(state.marketState.spyReturn)],
    ["RSP minus SPY", formatPercent(state.marketState.rspSpyReturn, 2, "pp")],
    ["Positive breadth", formatPercent(state.marketState.breadthPct, 1)],
    ["Top-10 contribution", formatPercent(state.marketState.concentrationTop10, 1)],
    ["Realized vol (15m)", formatPercent(state.marketState.realizedVol, 1)],
    ["ATM IV", formatPercent(state.marketState.atmIv * 100, 1)]
  ];
  readout.replaceChildren(...rows.map(([label, value]) => {
    const row = create("div");
    row.append(create("dt", null, label), create("dd", null, value));
    return row;
  }));
  const fingerprint = $("#state-fingerprint");
  const fingerprintRows = [
    ["Trend", formatPercent(state.marketState.spyReturn, 1)],
    ["Breadth", `${state.marketState.breadthPct.toFixed(0)}%`],
    ["Conc.", `${state.marketState.concentrationTop10.toFixed(0)}%`],
    ["RV", formatPercent(state.marketState.realizedVol, 0)],
    ["IV", formatPercent(state.marketState.atmIv * 100, 0)],
    ["Corr.", formatNumber(state.marketState.realizedCorrelation, 2)]
  ];
  fingerprint.replaceChildren(...fingerprintRows.map(([label, value]) => {
    const item = create("div", "fingerprint-item");
    item.append(create("span", null, label), create("strong", null, value));
    return item;
  }));
}

function renderParticipation() {
  const tick = currentTick();
  const target = $("#participation-visual");
  const rows = [
    ["Positive constituents", tick.breadth.positivePct, 100, ""],
    ["A/D breadth", (tick.breadth.advanceDecline + 500) / 10, 100, tick.breadth.advanceDecline < 0 ? "is-coral" : ""],
    ["Up/down volume", Math.min(100, tick.breadth.upDownVolumeRatio * 50), 100, tick.breadth.upDownVolumeRatio < 1 ? "is-coral" : "is-amber"],
    ["Top-10 contribution", tick.concentration.top10ContributionPct, 100, "is-amber"]
  ];
  target.replaceChildren(...rows.map(([label, value, maximum, modifier]) => {
    const row = create("div", "participation-metric");
    const copy = create("div");
    copy.append(create("span", null, label), create("strong", null, label === "A/D breadth" ? String(tick.breadth.advanceDecline) : label === "Up/down volume" ? formatNumber(tick.breadth.upDownVolumeRatio, 2) : `${Number(value).toFixed(1)}%`));
    const line = create("div", `progress-line ${modifier}`);
    const fill = create("span");
    fill.style.width = `${Math.max(0, Math.min(100, (value / maximum) * 100))}%`;
    line.append(fill);
    row.append(copy, line);
    return row;
  }));
  $("#breadth-source").textContent = "DERIVED PROXY";
  $("#participation-note").textContent = `${tick.breadth.sourceLabel}. It is not the official $ADD, $TICK, $UVOL, or $DVOL feed.`;
}

function renderSectors() {
  const grid = $("#sector-grid");
  grid.replaceChildren(...currentTick().sectors.map((sector) => {
    const cell = create("div", `sector-cell ${sector.returnPct > 0.15 ? "positive" : sector.returnPct < -0.15 ? "negative" : "neutral"}`);
    cell.title = `${sector.label}: ${formatPercent(sector.returnPct)}; relative to SPY ${formatPercent(sector.relativeToSpy, 2, "pp")}`;
    cell.append(create("strong", null, sector.symbol), create("span", null, formatPercent(sector.returnPct)));
    return cell;
  }));
}

function renderVolatility() {
  const volatility = currentTick().volatility;
  const target = $("#volatility-visual");
  const grid = create("div", "vol-grid");
  [["VIX context", volatility.vix], ["VIX9D context", volatility.vix9d], ["ATM IV", volatility.atmIv * 100], ["15m realized", state.marketState.realizedVol]].forEach(([label, value]) => {
    const item = create("div", "vol-stat");
    item.append(create("span", null, label), create("strong", null, formatPercent(value, 1)));
    grid.append(item);
  });
  const term = create("div", "term-strip");
  volatility.term.forEach((item) => {
    const row = create("div", "term-row");
    const bar = create("i");
    bar.style.width = `${Math.min(100, item.iv * 400)}%`;
    row.append(create("span", null, `${item.dte}D`), bar, create("strong", null, formatPercent(item.iv * 100, 1)));
    term.append(row);
  });
  target.replaceChildren(grid, term);
}

function renderComparison() {
  const left = state.session.timeline[state.comparison.left];
  const right = state.session.timeline[state.comparison.right];
  const first = state.session.timeline[0];
  const rows = [
    ["SPY return", ((left.underlyings.SPY / first.underlyings.SPY) - 1) * 100, ((right.underlyings.SPY / first.underlyings.SPY) - 1) * 100, "%"],
    ["RSP minus SPY", ((left.underlyings.RSP / first.underlyings.RSP) - (left.underlyings.SPY / first.underlyings.SPY)) * 100, ((right.underlyings.RSP / first.underlyings.RSP) - (right.underlyings.SPY / first.underlyings.SPY)) * 100, "pp"],
    ["Positive breadth", left.breadth.positivePct, right.breadth.positivePct, "%"],
    ["Top-10 contribution", left.concentration.top10ContributionPct, right.concentration.top10ContributionPct, "%"],
    ["ATM IV", left.volatility.atmIv * 100, right.volatility.atmIv * 100, "%"],
    ["Realized correlation", left.realizedCorrelation, right.realizedCorrelation, ""]
  ];
  $("#comparison-grid").replaceChildren(...rows.map(([label, a, b, unit]) => {
    const row = create("div", "comparison-row");
    row.append(create("span", null, label), create("strong", null, `${formatNumber(a, 2)}${unit}`), create("small", null, `${formatNumber(b, 2)}${unit}`));
    return row;
  }));
}

function renderRightRail() {
  const target = $("#right-state");
  const rows = [
    ["SPY", `$${currentTick().underlyings.SPY.toFixed(2)}`],
    ["RSP/SPY", formatPercent(state.marketState.rspSpyReturn, 2, "pp")],
    ["Breadth", `${state.marketState.breadthPct.toFixed(1)}%`],
    ["VIX context", state.marketState.vix.toFixed(2)],
    ["ATM IV", `${(state.marketState.atmIv * 100).toFixed(1)}%`]
  ];
  target.replaceChildren(...rows.map(([label, value]) => {
    const row = create("div", "right-state-row");
    row.append(create("span", null, label), create("strong", null, value));
    return row;
  }));
  $("#assumption-list").replaceChildren(...[
    `Model rate ${(state.session.assumptions.rate * 100).toFixed(2)}%`,
    `Dividend yield ${(state.session.assumptions.dividend * 100).toFixed(2)}%`,
    "Option model: European-style approximation",
    "Gamma sign: not observed from OI",
    state.session.assumptions.constituent_mode === "synthetic" ? "Constituents: synthetic fixture" : state.session.assumptions.constituent_mode
  ].map((value) => create("li", null, value)));
  $("#event-list").replaceChildren(...state.session.events.map((event) => create("li", null, `${etTime(state.session.timeline[event.index].timestamp)} ET - ${event.label}`)));
}

function renderTimeline() {
  const target = $("#timeline-events");
  target.replaceChildren(...state.session.events.map((event) => {
    const marker = create("span", "timeline-event-marker");
    marker.style.left = `${(event.index / (state.session.timeline.length - 1)) * 100}%`;
    marker.title = event.label;
    return marker;
  }));
}

function renderCurrent() {
  renderTopbar();
  renderMarketState();
  renderParticipation();
  renderSectors();
  renderVolatility();
  renderComparison();
  renderRightRail();
  renderTimeline();
  $("#notebook-link-status").textContent = `Linked to ${etTime(currentTick().timestamp)} ET / ${state.experiment ? "experiment available" : "no experiment yet"}`;
}

function optionRows() {
  const spot = currentTick().underlyings.SPY;
  return currentChain().filter((item) => {
    if (item.expiration !== state.filters.expiration) return false;
    if (state.filters.type !== "both" && item.type !== state.filters.type) return false;
    return state.filters.strikeWindow !== "near" || Math.abs(item.strike - spot) <= 20;
  });
}

function renderOptionTable(rows) {
  const body = $("#options-table-body");
  body.replaceChildren(...rows.map((item) => {
    const row = document.createElement("tr");
    const values = [
      [item.type, `${item.type}-text`], [item.strike.toFixed(0)], [item.bid.toFixed(2)], [item.ask.toFixed(2)], [item.mid.toFixed(2)],
      [(item.ask - item.bid).toFixed(2)], [item.volume.toLocaleString()], [item.open_interest?.toLocaleString() ?? "n/a"],
      [item.iv == null ? "n/a" : `${(item.iv * 100).toFixed(1)}%`], [formatNumber(item.delta, 3)], [formatNumber(item.gamma, 4)], [formatNumber(item.theta, 3)], [formatNumber(item.vega, 3)], [item.quote_status, `status-${item.quote_status}`]
    ];
    values.forEach(([value, className]) => row.append(create("td", className, value)));
    return row;
  }));
}

function ensureSurface(key, selector, onSelect) {
  if (!state.surfaces[key]) {
    state.surfaces[key] = new SurfaceView($(selector), { onSelect });
  }
  return state.surfaces[key];
}

function gridFromChain(chain, metric = "iv", type = "both") {
  const expirations = [...new Set(chain.map((item) => item.expiration))].sort();
  const strikes = [...new Set(chain.map((item) => item.strike))].sort((left, right) => left - right);
  const filtered = chain.filter((item) => type === "both" || item.type === type);
  const valueOf = (item) => metric === "spread" ? item.ask - item.bid : item[metric];
  const meshContracts = filtered.filter((item) => item.quote_status === "valid" && Number.isFinite(valueOf(item)));
  const values = expirations.map((expiration) => strikes.map((strike) => {
    const candidates = meshContracts.filter((item) => item.expiration === expiration && item.strike === strike).map(valueOf);
    return candidates.length ? candidates.reduce((sum, value) => sum + value, 0) / candidates.length : null;
  }));
  const rawPoints = filtered.map((item) => ({
    row: expirations.indexOf(item.expiration),
    column: strikes.indexOf(item.strike),
    value: valueOf(item),
    status: item.quote_status,
    data: item
  }));
  return { values, strikes, expirations, rawPoints };
}

async function renderIvSurface() {
  const grid = gridFromChain(currentChain(), "iv", state.filters.type);
  const view = ensureSurface("iv", "#iv-surface", (point) => {
    const item = point.data;
    $("#iv-nearest").textContent = `${item.contract} | ${item.type} ${item.strike} | IV ${(item.iv * 100).toFixed(1)}% | bid/ask ${item.bid.toFixed(2)}/${item.ask.toFixed(2)} | ${item.iv_source}`;
  });
  const surface = view.update({
    values: grid.values,
    rawPoints: grid.rawPoints,
    showRaw: $("#iv-raw-toggle").checked,
    showWire: $("#iv-wire-toggle").checked,
    valueLabel: "IV",
    axes: { x: "Strike", y: "Expiration", z: "IV" }
  });
  const selectedIndex = state.index;
  const selectedTimestamp = currentTick().timestamp;
  try {
    const params = sessionParams();
    params.set("index", String(selectedIndex));
    params.set("type", state.filters.type);
    const response = await api(`/api/analysis/surface-quality?${params.toString()}`);
    if (state.index !== selectedIndex || currentTick().timestamp !== selectedTimestamp || state.optionsView !== "iv") return;
    const quality = response.quality;
    const gapNote = surface.imputedCells ? ` ${surface.imputedCells} grid cells use the visible global-mean fallback.` : " No grid cells were imputed.";
    $("#iv-quality").textContent = `Surface quality: ${quality.quality}; ${quality.rawCount} validated raw points across ${quality.maturities} expirations and ${quality.strikes} strikes; ${quality.calendar_variance_violations} simple calendar-variance flags. ${quality.note}${gapNote}`;
  } catch (error) {
    $("#iv-quality").textContent = `Surface diagnostic unavailable: ${error.message}`;
  }
}

function renderOdteSurface() {
  const expiration = "2026-08-10";
  const metric = $("#odte-metric").value;
  const type = state.filters.type === "both" ? "call" : state.filters.type;
  const chains = state.session.timeline.slice(0, -1).map((tick) => state.session.optionSnapshots[tick.timestamp].filter((item) => item.expiration === expiration && item.type === type));
  const strikes = [...new Set(chains.flat().map((item) => item.strike))].sort((left, right) => left - right);
  const valueOf = (item) => metric === "spread" ? item.ask - item.bid : item[metric];
  const values = chains.map((chain) => strikes.map((strike) => {
    const item = chain.find((entry) => entry.strike === strike);
    return item ? valueOf(item) : null;
  }));
  const rawPoints = chains.flatMap((chain, row) => chain.map((item) => ({ row, column: strikes.indexOf(item.strike), value: valueOf(item), status: item.quote_status, data: item })));
  const view = ensureSurface("odte", "#odte-surface", (point) => {
    const item = point.data;
    $("#odte-nearest").textContent = `${etTime(item.timestamp)} ET | ${item.contract} | ${metric} ${metric === "iv" ? `${(item.iv * 100).toFixed(1)}%` : formatNumber(valueOf(item), 4)} | 0DTE model values omit the exact-expiry snapshot.`;
  });
  view.update({ values, rawPoints, showRaw: $("#odte-raw-toggle").checked, showWire: true, valueLabel: metric, axes: { x: "Strike", y: "Recorded time", z: metric } });
}

async function renderGamma() {
  try {
    const response = await api("/api/analysis/gamma", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sessionBody(), index: state.index, mode: $("#gamma-mode").value }) });
    const exposure = response.exposure;
    renderGammaChart($("#gamma-chart"), exposure.rows, exposure.mode);
    $("#gamma-readout").replaceChildren(
      create("p", null, exposure.warning),
      create("p", null, `Definition: ${exposure.definition}.`),
      create("p", null, `Magnitude: ${Math.round(exposure.totalMagnitude).toLocaleString()}.`),
      create("p", null, `Signed scenario total: ${Math.round(exposure.totalSigned).toLocaleString()}.`),
      create("p", null, "POSITION SIGN IS NOT OBSERVED. This is sensitivity analysis, not dealer inventory.")
    );
  } catch (error) {
    $("#gamma-readout").textContent = error.message;
  }
}

async function renderPnl() {
  const position = {
    type: $("#pnl-type").value,
    strike: Number($("#pnl-strike").value),
    quantity: Number($("#pnl-quantity").value),
    hours: Number($("#pnl-hours").value),
    volatility: currentTick().volatility.atmIv
  };
  try {
    const response = await api("/api/analysis/pnl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sessionBody(), index: state.index, position }) });
    const surface = response.surface;
    const rawPoints = surface.values.flatMap((row, rowIndex) => row.map((value, column) => ({ row: rowIndex, column, value, status: "valid", data: { spotShock: surface.spotShocks[column], volShock: surface.volShocks[rowIndex], value } })));
    const view = ensureSurface("pnl", "#pnl-surface", (point) => {
      $("#pnl-assumptions").textContent = `Selected cell: spot shock ${formatPercent(point.data.spotShock * 100, 1)}, IV shock ${formatPercent(point.data.volShock * 100, 1)}, theoretical P&L $${point.data.value.toFixed(0)}.`;
    });
    view.update({ values: surface.values, rawPoints, showRaw: false, showWire: true, valueLabel: "P&L", axes: { x: "Spot shock", y: "IV shock", z: "P&L" } });
    $("#pnl-assumptions").textContent = `${surface.assumptions.model}; rate ${(surface.assumptions.rate * 100).toFixed(2)}%; dividend ${(surface.assumptions.dividend * 100).toFixed(2)}%; entry value $${surface.assumptions.currentValue.toFixed(2)}. Midpoint theoretical, not executable.`;
  } catch (error) {
    $("#pnl-assumptions").textContent = error.message;
  }
}

function renderOptions() {
  const expirations = [...new Set(currentChain().map((item) => item.expiration))].sort();
  const selector = $("#expiry-select");
  if (!selector.options.length || !expirations.every((expiration) => [...selector.options].some((option) => option.value === expiration))) {
    selector.replaceChildren(...expirations.map((expiration) => new Option(expiration, expiration)));
  }
  if (!expirations.includes(state.filters.expiration)) state.filters.expiration = expirations[0];
  selector.value = state.filters.expiration;
  const rows = optionRows();
  renderOptionTable(rows);
  $("#options-count").textContent = `${rows.length} normalized contracts / ${etTime(currentTick().timestamp)} ET`;
  $("#options-provenance").textContent = `${currentTick().provenance.is_synthetic ? "SYNTHETIC" : "PROVIDER"} / IV synthetic surface / Greeks model`;
  if (state.optionsView === "iv") renderIvSurface();
  if (state.optionsView === "odte") renderOdteSurface();
  if (state.optionsView === "gamma") renderGamma();
  if (state.optionsView === "pnl") renderPnl();
}

function renderConditions() {
  const list = $("#condition-list");
  list.replaceChildren(...state.hypothesis.conditions.map((condition, index) => {
    const row = create("div", "condition-row");
    row.append(create("code", null, `${condition.field} ${condition.operator} ${condition.threshold}`));
    const remove = create("button", null, "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.hypothesis.conditions.splice(index, 1);
      renderConditions();
    });
    row.append(remove);
    return row;
  }));
  $("#compiled-test").textContent = state.hypothesis.conditions.length
    ? state.hypothesis.conditions.map((condition) => `${condition.field} ${condition.operator} ${condition.threshold}`).join("\nAND\n")
    : "Add an observable condition.";
}

function populateHypothesisControls() {
  const field = $("#condition-field");
  field.replaceChildren(...Object.entries(fieldLabels).map(([value, label]) => new Option(label, value)));
  const target = $("#target-field");
  target.replaceChildren(...Object.entries(targetLabels).map(([value, label]) => new Option(label, value)));
  target.value = state.hypothesis.target.field;
}

function renderExperiment() {
  const target = $("#result-summary");
  const holdout = $("#holdout-summary");
  if (!state.experiment) {
    target.replaceChildren(create("div", "result-metric", "No experiment run"));
    holdout.replaceChildren();
    renderDistribution($("#distribution-chart"), []);
    $("#test-risk").textContent = "NO TEST RUN";
    return;
  }
  const summary = state.experiment.all.summary;
  const metrics = [
    ["N", summary.n], ["Mean", formatPercent(summary.mean, 3)], ["Median", formatPercent(summary.median, 3)], ["Approx. 95% mean CI", summary.ci95 ? `${formatPercent(summary.ci95[0], 3)} to ${formatPercent(summary.ci95[1], 3)}` : "n/a"]
  ];
  target.replaceChildren(...metrics.map(([label, value]) => {
    const item = create("div", "result-metric");
    item.append(create("span", null, label), create("strong", null, String(value)));
    return item;
  }));
  renderDistribution($("#distribution-chart"), state.experiment.all.values);
  const holdoutRows = [
    ["Training sample", `${state.experiment.train.summary.n} events; mean ${formatPercent(state.experiment.train.summary.mean, 3)}`],
    ["Untouched holdout", `${state.experiment.holdout.summary.n} events; mean ${formatPercent(state.experiment.holdout.summary.mean, 3)}`],
    ["Validation", state.experiment.validation.method],
    ["Data / run", `${state.experiment.data_hash.slice(0, 12)}... / ${state.experiment.run_timestamp}`]
  ];
  holdout.replaceChildren(...holdoutRows.map(([label, value]) => {
    const item = create("div", "holdout-cell");
    item.append(create("span", null, label), create("strong", null, value));
    return item;
  }));
  $("#test-risk").textContent = state.experiment.validation.multiple_testing_risk === "elevated" ? `MULTIPLE TESTING: ${state.experiment.validation.related_tests}` : "INITIAL TEST";
}

function renderAnalogues() {
  const target = $("#analogue-list");
  if (!state.analogues.length) {
    target.replaceChildren(create("div", "analogue-row", "Use the selected market state to find past-only synthetic analogues."));
    return;
  }
  target.replaceChildren(...state.analogues.map((row) => {
    const item = create("div", "analogue-row");
    item.append(
      create("strong", null, etDate(row.timestamp)),
      create("span", null, `similarity ${row.similarity.toFixed(2)}`),
      create("span", null, `next 60m ${formatPercent(row.targets.forwardReturn60m, 3)}`),
      create("span", null, `${row.decomposition[0]?.field ?? ""} differs most`)
    );
    return item;
  }));
}

function renderHypothesis() {
  renderConditions();
  renderExperiment();
  renderAnalogues();
}

function renderSources() {
  const grid = $("#provider-grid");
  const entries = Object.entries(state.health.providers);
  grid.replaceChildren(...entries.map(([key, provider]) => {
    const card = create("article", "provider-card");
    const header = create("header");
    header.append(create("h2", null, provider.name), create("span", `provider-status${provider.configured ? " configured" : ""}`, provider.configured ? "configured" : "not configured"));
    card.append(header);
    const capabilities = create("ul", "capability-list");
    Object.entries(provider.capabilities).forEach(([name, available]) => {
      const row = create("li", available ? "" : "is-off");
      row.append(create("span", null, name.replaceAll("_", " ")), create("span", null, available ? "available" : "unavailable"));
      capabilities.append(row);
    });
    card.append(capabilities);
    return card;
  }));
  $("#health-mode").textContent = (state.session?.mode ?? state.health.mode).toUpperCase();
  const sourceDetail = $("#source-detail");
  sourceDetail.replaceChildren(
    create("div", null, `Underlying fallback: ${state.health.fallback_order.underlying_current.join(" -> ")}.`),
    create("div", null, `Option-chain fallback: ${state.health.fallback_order.option_chain.join(" -> ")}.`),
    create("div", null, "The server cache stores provider responses with request identity, fetch time, and a fixed TTL. Rate-limit failures name the provider and retry time; browser code never receives a key."),
    create("div", null, "Demo responses are deterministic synthetic data. A public deployment must not substitute personal-use provider data for this fixture.")
  );
}

async function formalizeObservation() {
  const start = Math.min(state.observation.start, state.observation.end);
  const end = Math.max(state.observation.start, state.observation.end);
  try {
    const response = await api("/api/analysis/observation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sessionBody(), start, end }) });
    state.hypothesis = response.proposal;
    $("#hypothesis-name").value = state.hypothesis.name;
    setView("hypothesis");
    setStatus("Observation compiled into editable conditions");
  } catch (error) {
    setStatus(error.message);
  }
}

async function runHypothesis() {
  if (!state.hypothesis.conditions.length) {
    setStatus("Add at least one observable condition first");
    return;
  }
  state.hypothesis.name = $("#hypothesis-name").value.trim() || "Untitled MarketGlass hypothesis";
  state.hypothesis.target = { field: $("#target-field").value, horizonMinutes: Number($("#target-horizon").value) };
  const relatedTests = state.relatedTests + 1;
  try {
    const response = await api("/api/analysis/experiment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sessionBody(), spec: state.hypothesis, relatedTests }) });
    state.experiment = response.experiment;
    state.relatedTests = relatedTests;
    state.notebook?.setContext({ marketState: state.marketState, experimentId: state.experiment.experiment_id });
    renderExperiment();
    setStatus(`Experiment ${state.experiment.experiment_id} ran on the synthetic chronological fixture`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function findAnalogues() {
  try {
    const response = await api("/api/analysis/analogues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sessionBody(), index: state.index }) });
    state.analogues = response.analogues;
    renderAnalogues();
    setStatus("Past-only analogues updated");
  } catch (error) {
    setStatus(error.message);
  }
}

function download(filename, payload, type = "application/json") {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function exportExperiment() {
  if (!state.experiment) {
    setStatus("Run an experiment before exporting it");
    return;
  }
  download(`${state.experiment.experiment_id}.json`, JSON.stringify(state.experiment, null, 2));
  setStatus("Experiment export created");
}

async function recordSession() {
  try {
    const response = await api("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "demo" }) });
    await refreshRecordings(response.id);
    setStatus(`Recorded local session: ${response.id}`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function refreshRecordings(selectedId = $("#recording-select").value) {
  const response = await api("/api/records");
  state.recordings = response.recordings;
  const selector = $("#recording-select");
  selector.replaceChildren(new Option(state.recordings.length ? "Choose a recording" : "No recordings yet", ""), ...state.recordings.map((id) => new Option(id, id)));
  selector.disabled = state.recordings.length === 0;
  if (state.recordings.includes(selectedId)) selector.value = selectedId;
}

async function loadSession(mode, recordingId = "") {
  try {
    const params = new URLSearchParams({ mode });
    if (recordingId) params.set("recording", recordingId);
    const session = await api(`/api/session?${params.toString()}`);
    state.session = session;
    state.recordingId = recordingId || null;
    state.index = Math.min(16, session.timeline.length - 1);
    state.observation = { start: Math.min(12, session.timeline.length - 1), end: Math.min(18, session.timeline.length - 1) };
    state.comparison = { left: Math.min(8, session.timeline.length - 1), right: Math.min(20, session.timeline.length - 1) };
    $("#timeline-range").max = String(session.timeline.length - 1);
    $("#observation-start").max = String(session.timeline.length - 1);
    $("#observation-end").max = String(session.timeline.length - 1);
    await refreshMarketState();
    configureCompareControls();
    renderCurrent();
    renderOptions();
    setStatus(`${mode === "recorded" ? "Recorded session" : "Demo fixture"} loaded`);
  } catch (error) {
    renderTopbar();
    setStatus(error.message);
  }
}

function configureCompareControls() {
  const makeOptions = () => state.session.timeline.map((tick, index) => new Option(`${etTime(tick.timestamp)} ET`, String(index)));
  const left = $("#compare-left");
  const right = $("#compare-right");
  left.replaceChildren(...makeOptions());
  right.replaceChildren(...makeOptions());
  left.value = String(state.comparison.left);
  right.value = String(state.comparison.right);
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-options-panel]").forEach((button) => button.addEventListener("click", () => setOptionsView(button.dataset.optionsPanel)));
  $("#timeline-range").addEventListener("input", (event) => setIndex(Number(event.target.value), { pause: true }));
  $("#step-back").addEventListener("click", () => setIndex(state.index - 1, { pause: true }));
  $("#step-forward").addEventListener("click", () => setIndex(state.index + 1, { pause: true }));
  $("#play-button").addEventListener("click", () => { state.playing = !state.playing; renderTopbar(); });
  $("#speed-select").addEventListener("change", (event) => { state.speed = Number(event.target.value); });
  $("#observation-start").addEventListener("input", (event) => { state.observation.start = Number(event.target.value); renderMarketState(); });
  $("#observation-end").addEventListener("input", (event) => { state.observation.end = Number(event.target.value); renderMarketState(); });
  $("#formalize-button").addEventListener("click", formalizeObservation);
  $("#bookmark-button").addEventListener("click", () => {
    try {
      const bookmarks = readBookmarks();
      bookmarks.unshift({ timestamp: currentTick().timestamp, state: state.marketState, note: "Market moment" });
      localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks.slice(0, 20)));
      state.notebook?.setContext({ marketState: state.marketState, experimentId: state.experiment?.experiment_id ?? null });
      setStatus("Market moment bookmarked locally and linked to the notebook");
    } catch {
      setStatus("Browser storage could not save this bookmark");
    }
  });
  $("#compare-left").addEventListener("change", (event) => { state.comparison.left = Number(event.target.value); renderComparison(); });
  $("#compare-right").addEventListener("change", (event) => { state.comparison.right = Number(event.target.value); renderComparison(); });
  $("#expiry-select").addEventListener("change", (event) => { state.filters.expiration = event.target.value; renderOptions(); });
  $("#contract-filter").addEventListener("change", (event) => { state.filters.type = event.target.value; renderOptions(); });
  $("#strike-window").addEventListener("change", (event) => { state.filters.strikeWindow = event.target.value; renderOptions(); });
  $("#iv-raw-toggle").addEventListener("change", (event) => state.surfaces.iv?.setRawVisible(event.target.checked));
  $("#iv-wire-toggle").addEventListener("change", (event) => state.surfaces.iv?.setWireVisible(event.target.checked));
  $("#iv-reset-camera").addEventListener("click", () => state.surfaces.iv?.resetCamera());
  $("#odte-metric").addEventListener("change", renderOdteSurface);
  $("#odte-raw-toggle").addEventListener("change", (event) => state.surfaces.odte?.setRawVisible(event.target.checked));
  $("#odte-reset-camera").addEventListener("click", () => state.surfaces.odte?.resetCamera());
  $("#gamma-mode").addEventListener("change", renderGamma);
  $("#pnl-update").addEventListener("click", renderPnl);
  $("#pnl-reset-camera").addEventListener("click", () => state.surfaces.pnl?.resetCamera());
  $("#add-condition").addEventListener("click", () => {
    const threshold = Number($("#condition-threshold").value);
    if (!Number.isFinite(threshold)) {
      setStatus("Condition thresholds must be finite");
      return;
    }
    state.hypothesis.conditions.push({ field: $("#condition-field").value, operator: $("#condition-operator").value, threshold });
    renderConditions();
  });
  $("#run-hypothesis").addEventListener("click", runHypothesis);
  $("#find-analogues").addEventListener("click", findAnalogues);
  $("#hypothesis-export").addEventListener("click", exportExperiment);
  $("#record-session-button").addEventListener("click", recordSession);
  $("#data-mode-select").addEventListener("change", (event) => loadSession(event.target.value));
  $("#recording-select").addEventListener("change", (event) => {
    if (event.target.value) loadSession("recorded", event.target.value);
  });
  $("#command-button").addEventListener("click", () => $("#command-dialog").showModal());
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#command-dialog").showModal();
      $("#command-search").focus();
    }
  });
}

function configureCommandPalette() {
  const commands = [
    ["Open market state", () => setView("market")], ["Open options lab", () => setView("options")], ["Open IV surface", () => { setView("options"); setOptionsView("iv"); }], ["Open 0DTE surface", () => { setView("options"); setOptionsView("odte"); }], ["Open hypothesis lab", () => setView("hypothesis")], ["Find analogues", () => { setView("hypothesis"); findAnalogues(); }], ["Open research notebook", () => setView("notebook")], ["Record session", recordSession], ["Open data sources", () => setView("sources")]
  ];
  const list = $("#command-list");
  const render = (query = "") => {
    const matches = commands.filter(([label]) => label.toLowerCase().includes(query.toLowerCase()));
    list.replaceChildren(...matches.map(([label, run]) => {
      const button = create("button", "command-item", label);
      button.type = "button";
      button.addEventListener("click", () => { $("#command-dialog").close(); run(); });
      return button;
    }));
  };
  $("#command-search").addEventListener("input", (event) => render(event.target.value));
  render();
}

function startReplayLoop() {
  let last = performance.now();
  const tick = async (now) => {
    const interval = Math.max(65, 720 / state.speed);
    if (state.playing && now - last >= interval) {
      const step = state.speed >= 20 ? 2 : 1;
      if (state.index >= state.session.timeline.length - 1) {
        state.playing = false;
        renderTopbar();
      } else {
        last = now;
        await setIndex(state.index + step);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function bootstrap() {
  try {
    const [session, health] = await Promise.all([api("/api/session?mode=demo"), api("/api/health")]);
    state.session = session;
    state.health = health;
    $("#timeline-range").max = String(session.timeline.length - 1);
    $("#observation-start").max = String(session.timeline.length - 1);
    $("#observation-end").max = String(session.timeline.length - 1);
    $("#timeline-range").value = String(state.index);
    $("#observation-start").value = String(state.observation.start);
    $("#observation-end").value = String(state.observation.end);
    await refreshMarketState();
    configureCompareControls();
    populateHypothesisControls();
    state.notebook = createNotebook($("#notebook-root"), { onStatus: setStatus });
    bindEvents();
    configureCommandPalette();
    await refreshRecordings();
    renderCurrent();
    renderOptions();
    renderHypothesis();
    renderSources();
    state.notebook.setContext({ marketState: state.marketState, experimentId: null });
    startReplayLoop();
  } catch (error) {
    document.body.replaceChildren(create("main", "boot-error", `MarketGlass could not start: ${error.message}`));
  }
}

bootstrap();
