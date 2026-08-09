import {
  clamp,
  describeScenarios,
  evaluateResearch,
  formatSignedPercent,
  scoreEvidence,
  validateEvidenceDraft
} from "./logic.mjs";
import { glossary, learningSteps, starterState } from "./data.js";

const STORAGE_KEY = "marketglass-workbench-v1";
const scenarioList = document.querySelector("#scenario-list");
const evidenceList = document.querySelector("#evidence-list");
const falsifierList = document.querySelector("#falsifier-list");
const evidenceForm = document.querySelector("#evidence-form");
const falsifierForm = document.querySelector("#falsifier-form");
const saveStatus = document.querySelector("#save-status");
const canvas = document.querySelector("#belief-canvas");

let state = readState();

function cloneStarterState() {
  return JSON.parse(JSON.stringify(starterState));
}

function readState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (
      saved &&
      Array.isArray(saved.scenarios) &&
      Array.isArray(saved.evidence) &&
      Array.isArray(saved.falsifiers)
    ) {
      return saved;
    }
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      return cloneStarterState();
    }
  }
  return cloneStarterState();
}

function saveState(message = "Saved locally") {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveStatus.textContent = message;
  } catch {
    saveStatus.textContent = "Storage unavailable";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return replacements[character];
  });
}

function pluralize(count, singular, plural) {
  return String(count) + " " + (count === 1 ? singular : plural);
}

function renderScenarioRows() {
  const summary = describeScenarios(state.scenarios);
  state.scenarios = summary.scenarios;
  scenarioList.innerHTML = summary.scenarios
    .map((scenario, index) => {
      return [
        '<div class="scenario-row">',
        '<div class="scenario-name">',
        "<strong>" + escapeHtml(scenario.label) + "</strong>",
        "<span>" + escapeHtml(scenario.key) + " case</span>",
        "</div>",
        '<label class="range-control">',
        '<span class="sr-only">Probability for ' + escapeHtml(scenario.label) + "</span>",
        '<input type="range" min="0" max="100" value="' + scenario.probability + '"',
        ' data-scenario-index="' + index + '" data-scenario-field="probability">',
        '<input class="number-input" type="number" min="0" max="100" value="' + scenario.probability + '"',
        ' data-scenario-index="' + index + '" data-scenario-field="probability">',
        "</label>",
        '<label class="return-input">',
        '<span class="sr-only">Return for ' + escapeHtml(scenario.label) + "</span>",
        '<input class="number-input" type="number" min="-100" max="1000" value="' + scenario.returnPct + '"',
        ' data-scenario-index="' + index + '" data-scenario-field="returnPct">',
        "<span>%</span>",
        "</label>",
        "</div>"
      ].join("");
    })
    .join("");

  renderSummary();
}

function renderSummary() {
  const scenarios = describeScenarios(state.scenarios);
  const evidence = scoreEvidence(state.evidence);
  const health = evaluateResearch(state.scenarios, state.evidence, state.falsifiers);
  const scenarioStatus = document.querySelector("#scenario-status");
  const total = document.querySelector("#probability-total");

  document.querySelector("#expected-return").textContent = formatSignedPercent(scenarios.expectedReturn);
  total.textContent = String(scenarios.totalProbability) + "%";
  document.querySelector("#evidence-conviction").textContent = String(evidence.conviction);
  document.querySelector("#research-health").textContent =
    String(health.score) + " / " + health.label;
  document.querySelector("#belief-map-label").textContent =
    health.label + " research posture";

  scenarioStatus.textContent = scenarios.isBalanced
    ? "Probabilities balanced"
    : "Adjust by " + String(scenarios.balanceGap) + " points";
  scenarioStatus.classList.toggle("is-good", scenarios.isBalanced);
  total.style.color = scenarios.isBalanced ? "var(--green)" : "var(--coral)";

  drawBeliefMap(scenarios.expectedReturn, evidence.conviction, health.label);
}

function renderEvidence() {
  const validEntries = state.evidence.filter((entry) => validateEvidenceDraft(entry).valid);
  document.querySelector("#ledger-count").textContent = pluralize(
    validEntries.length,
    "claim",
    "claims"
  );

  if (validEntries.length === 0) {
    evidenceList.innerHTML =
      '<p class="empty-state">No claims yet. A claim can support or challenge the current thesis.</p>';
    renderSummary();
    return;
  }

  evidenceList.innerHTML = validEntries
    .map((entry, index) => {
      const typeLabel = entry.kind.charAt(0).toUpperCase() + entry.kind.slice(1);
      const directionLabel = entry.direction === "challenge" ? "Challenges" : "Supports";
      return [
        '<article class="evidence-row ' +
          (entry.direction === "challenge" ? "is-challenge" : "") +
          '">',
        "<div>",
        "<h3>" + escapeHtml(entry.title) + "</h3>",
        '<p class="evidence-meta">',
        "<span><strong>" + directionLabel + "</strong></span>",
        "<span>" + escapeHtml(typeLabel) + "</span>",
        "<span>" + String(entry.confidence) + "% confidence</span>",
        entry.source ? "<span>" + escapeHtml(entry.source) + "</span>" : "",
        "</p>",
        "</div>",
        '<button class="muted-button" type="button" data-remove-evidence="' + index + '">Remove</button>',
        "</article>"
      ].join("");
    })
    .join("");

  renderSummary();
}

function renderFalsifiers() {
  const activeFalsifiers = state.falsifiers.filter(
    (value) => typeof value === "string" && value.trim().length >= 4
  );
  state.falsifiers = activeFalsifiers;
  document.querySelector("#falsifier-count").textContent = pluralize(
    activeFalsifiers.length,
    "condition",
    "conditions"
  );

  falsifierList.innerHTML = activeFalsifiers
    .map((falsifier, index) => {
      return [
        "<li>",
        "<span>" + escapeHtml(falsifier) + "</span>",
        '<button class="muted-button" type="button" data-remove-falsifier="' + index + '">Remove</button>',
        "</li>"
      ].join("");
    })
    .join("");

  renderSummary();
}

function renderMethod() {
  const list = document.querySelector("#method-list");
  list.innerHTML = learningSteps
    .map((step) => {
      return [
        "<li>",
        '<span class="method-number">' + escapeHtml(step.number) + "</span>",
        "<div>",
        "<h2>" + escapeHtml(step.title) + "</h2>",
        "<p>" + escapeHtml(step.copy) + "</p>",
        "</div>",
        "</li>"
      ].join("");
    })
    .join("");
}

function renderGlossary() {
  const list = document.querySelector("#glossary-list");
  list.innerHTML = glossary
    .map((item) => {
      return [
        "<article>",
        "<h2>" + escapeHtml(item.term) + "</h2>",
        "<p>" + escapeHtml(item.definition) + "</p>",
        '<p class="glossary-application">' + escapeHtml(item.application) + "</p>",
        "</article>"
      ].join("");
    })
    .join("");
}

function drawBeliefMap(expectedReturn, conviction, label) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) {
    return;
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(rect.width * pixelRatio);
  const height = Math.floor(rect.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const cssWidth = rect.width;
  const cssHeight = rect.height;
  const padding = 30;
  const plotWidth = cssWidth - padding * 2;
  const plotHeight = cssHeight - padding * 2;

  context.fillStyle = "#f7f9fc";
  context.fillRect(0, 0, cssWidth, cssHeight);

  context.strokeStyle = "#d9e1eb";
  context.lineWidth = 1;
  for (let column = 0; column <= 4; column += 1) {
    const x = padding + (plotWidth / 4) * column;
    context.beginPath();
    context.moveTo(x, padding);
    context.lineTo(x, cssHeight - padding);
    context.stroke();
  }
  for (let row = 0; row <= 4; row += 1) {
    const y = padding + (plotHeight / 4) * row;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(cssWidth - padding, y);
    context.stroke();
  }

  const normalizedReturn = clamp((expectedReturn + 40) / 140, 0, 1);
  const normalizedConviction = clamp(conviction / 100, 0, 1);
  const pointX = padding + plotWidth * normalizedReturn;
  const pointY = cssHeight - padding - plotHeight * normalizedConviction;

  context.strokeStyle = "#172033";
  context.lineWidth = 1.5;
  context.setLineDash([4, 5]);
  context.beginPath();
  context.moveTo(pointX, cssHeight - padding);
  context.lineTo(pointX, pointY);
  context.lineTo(padding, pointY);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#007c83";
  context.beginPath();
  context.arc(pointX, pointY, 10, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#172033";
  context.font = "700 12px ui-sans-serif, system-ui, sans-serif";
  context.fillText(label, Math.min(pointX + 14, cssWidth - 80), Math.max(pointY - 12, 20));

  context.fillStyle = "#607086";
  context.font = "12px ui-sans-serif, system-ui, sans-serif";
  context.fillText("lower expected return", padding, cssHeight - 9);
  context.textAlign = "right";
  context.fillText("higher expected return", cssWidth - padding, cssHeight - 9);
  context.textAlign = "left";
  context.save();
  context.translate(12, padding + 95);
  context.rotate(-Math.PI / 2);
  context.fillText("more challenge evidence", 0, 0);
  context.restore();
  context.save();
  context.translate(12, cssHeight - padding);
  context.rotate(-Math.PI / 2);
  context.fillText("more support evidence", 0, 0);
  context.restore();
}

function updateScenarioControlValues(index, field, value) {
  const selector =
    '[data-scenario-index="' + String(index) + '"][data-scenario-field="' + field + '"]';
  document.querySelectorAll(selector).forEach((control) => {
    control.value = String(value);
  });
}

function showView(viewName) {
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === viewName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === viewName;
    button.classList.toggle("is-active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  if (viewName === "workspace") {
    window.requestAnimationFrame(() => renderSummary());
  }
}

scenarioList.addEventListener("input", (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement)) {
    return;
  }
  const index = Number(control.dataset.scenarioIndex);
  const field = control.dataset.scenarioField;
  if (!Number.isInteger(index) || !["probability", "returnPct"].includes(field)) {
    return;
  }

  const limit = field === "probability" ? [0, 100] : [-100, 1000];
  const value = clamp(Number(control.value), limit[0], limit[1]);
  state.scenarios[index][field] = Number.isFinite(value) ? value : 0;
  updateScenarioControlValues(index, field, state.scenarios[index][field]);
  saveState();
  renderSummary();
});

evidenceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const draft = {
    title: document.querySelector("#evidence-title").value,
    source: document.querySelector("#evidence-source").value,
    kind: document.querySelector("#evidence-kind").value,
    direction: document.querySelector("#evidence-direction").value,
    confidence: Number(document.querySelector("#evidence-confidence").value)
  };
  const validation = validateEvidenceDraft(draft);
  const message = document.querySelector("#evidence-message");

  if (!validation.valid) {
    message.textContent = validation.errors.join(" ");
    return;
  }

  state.evidence.unshift({
    id: "evidence-" + String(Date.now()),
    ...validation.entry
  });
  evidenceForm.reset();
  document.querySelector("#evidence-confidence").value = "70";
  document.querySelector("#confidence-output").textContent = "70";
  message.textContent = "Claim added.";
  saveState();
  renderEvidence();
});

document.querySelector("#evidence-confidence").addEventListener("input", (event) => {
  document.querySelector("#confidence-output").textContent = event.target.value;
});

evidenceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-evidence]");
  if (!button) {
    return;
  }
  const index = Number(button.dataset.removeEvidence);
  if (!Number.isInteger(index)) {
    return;
  }
  const validPositions = state.evidence
    .map((entry, entryIndex) => (validateEvidenceDraft(entry).valid ? entryIndex : null))
    .filter((entryIndex) => entryIndex !== null);
  const stateIndex = validPositions[index];
  if (!Number.isInteger(stateIndex)) {
    return;
  }
  state.evidence.splice(stateIndex, 1);
  saveState();
  renderEvidence();
});

falsifierForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#falsifier-input");
  const value = input.value.trim();
  if (value.length < 4) {
    input.setCustomValidity("Write a condition of at least four characters.");
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  state.falsifiers.unshift(value);
  input.value = "";
  saveState();
  renderFalsifiers();
});

document.querySelector("#falsifier-input").addEventListener("input", (event) => {
  event.target.setCustomValidity("");
});

falsifierList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-falsifier]");
  if (!button) {
    return;
  }
  const index = Number(button.dataset.removeFalsifier);
  if (!Number.isInteger(index)) {
    return;
  }
  state.falsifiers.splice(index, 1);
  saveState();
  renderFalsifiers();
});

document.querySelector("[data-action='reset']").addEventListener("click", () => {
  if (!window.confirm("Reset the MarketGlass workspace to its starter research note?")) {
    return;
  }
  state = cloneStarterState();
  saveState("Starter workspace restored");
  renderScenarioRows();
  renderEvidence();
  renderFalsifiers();
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

window.addEventListener("resize", () => renderSummary());

renderMethod();
renderGlossary();
renderScenarioRows();
renderEvidence();
renderFalsifiers();
