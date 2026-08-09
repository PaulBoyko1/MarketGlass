import {
  describeScenarios,
  evaluateNotebookCompleteness,
  formatSignedPercent,
  validateEvidenceDraft
} from "/logic.mjs";
import { starterState } from "/data.js";

const STORAGE_KEY = "marketglass-research-notebook-v2";
const MONITOR_FIELDS = Object.freeze({
  spyReturn: "SPY session return (%)",
  rspSpyReturn: "RSP minus SPY (pp)",
  breadthPct: "Positive breadth (%)",
  concentrationTop10: "Top-10 contribution (%)",
  realizedVol: "Realized volatility (%)",
  atmIv: "ATM IV (decimal)"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function controlLabel(label, control) {
  const wrapper = element("label");
  wrapper.append(element("span", null, label), control);
  return wrapper;
}

function normalizeFalsifier(item) {
  if (typeof item === "string") {
    return { text: item, monitor: null };
  }
  return { text: String(item?.text ?? ""), monitor: item?.monitor ?? null };
}

function falsifierStatus(item, state) {
  const normalized = normalizeFalsifier(item);
  if (!normalized.monitor || !state) {
    return "text only";
  }
  const value = Number(state[normalized.monitor.field]);
  const threshold = Number(normalized.monitor.threshold);
  const operator = normalized.monitor.operator;
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || !Object.hasOwn(MONITOR_FIELDS, normalized.monitor.field) || ![">", ">=", "<", "<="].includes(operator)) {
    return "monitor unavailable for this state";
  }
  const met = operator === ">" ? value > threshold : operator === ">=" ? value >= threshold : operator === "<" ? value < threshold : value <= threshold;
  return `${MONITOR_FIELDS[normalized.monitor.field]} ${value.toFixed(2)} ${operator} ${threshold}: ${met ? "condition met" : "watching"}`;
}

export function createNotebook(root, { onStatus } = {}) {
  let state = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.scenarios) && Array.isArray(saved.evidence) && Array.isArray(saved.falsifiers)) {
        return saved;
      }
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // The notebook can still operate from the starter state when storage is unavailable.
      }
    }
    return clone(starterState);
  })();
  let context = { marketState: null, experimentId: null };

  const save = (message = "Notebook saved locally") => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      onStatus?.(message);
    } catch {
      onStatus?.("Browser storage could not save this notebook change");
    }
  };

  const render = () => {
    const scenarioSummary = describeScenarios(state.scenarios);
    state.scenarios = scenarioSummary.scenarios;
    const completeness = evaluateNotebookCompleteness(state.scenarios, state.evidence, state.falsifiers, context);
    const layout = element("div", "notebook-layout");
    const left = element("div");
    const right = element("div");

    const scenarioPanel = element("section", "notebook-panel");
    const heading = element("div", "panel-heading compact");
    const headingCopy = element("div");
    headingCopy.append(element("p", "panel-kicker", "Scenario model"), element("h2", null, "Possible outcomes"));
    heading.append(headingCopy);
    scenarioPanel.append(heading);
    const summary = element("div", "notebook-summary");
    const cells = [
      ["Weighted return", scenarioSummary.isBalanced ? formatSignedPercent(scenarioSummary.expectedReturn) : "Awaiting 100%"],
      ["Probability total", `${scenarioSummary.totalProbability}%`],
      ["Range", `${formatSignedPercent(scenarioSummary.downside)} to ${formatSignedPercent(scenarioSummary.upside)}`]
    ];
    for (const [label, value] of cells) {
      const cell = element("div");
      cell.append(element("span", null, label), element("strong", null, value));
      summary.append(cell);
    }
    scenarioPanel.append(summary);
    const scenarios = element("div", "scenario-list");
    scenarioSummary.scenarios.forEach((scenario, index) => {
      const row = element("div", "scenario-row");
      const name = element("div");
      name.append(element("strong", null, scenario.label), element("span", null, `${scenario.key} case`));
      const probability = element("input");
      probability.type = "range";
      probability.min = "0";
      probability.max = "100";
      probability.value = String(scenario.probability);
      probability.setAttribute("aria-label", `${scenario.label} probability`);
      probability.addEventListener("input", () => {
        state.scenarios[index].probability = Number(probability.value);
        save();
        render();
      });
      const returnInput = element("input");
      returnInput.type = "number";
      returnInput.min = "-100";
      returnInput.max = "1000";
      returnInput.value = String(scenario.returnPct);
      returnInput.setAttribute("aria-label", `${scenario.label} return percent`);
      returnInput.addEventListener("change", () => {
        state.scenarios[index].returnPct = Number(returnInput.value);
        save();
        render();
      });
      row.append(name, probability, returnInput);
      scenarios.append(row);
    });
    scenarioPanel.append(scenarios, element("p", "panel-note", scenarioSummary.isBalanced ? "The weighted arithmetic is visible only after probabilities total 100%. It is not a forecast." : "Fix the probability total before treating the weighted arithmetic as meaningful."));
    left.append(scenarioPanel);

    const evidencePanel = element("section", "notebook-panel");
    const evidenceHeading = element("div", "panel-heading compact");
    const evidenceCopy = element("div");
    evidenceCopy.append(element("p", "panel-kicker", "Evidence and counterevidence"), element("h2", null, "Claim ledger"));
    evidenceHeading.append(evidenceCopy, element("span", "source-label", `${state.evidence.length} claims`));
    evidencePanel.append(evidenceHeading);
    const form = element("form", "notebook-form");
    const title = element("input");
    title.required = true;
    title.maxLength = 180;
    const source = element("input");
    source.maxLength = 120;
    const kind = element("select");
    ["fact", "inference", "assumption", "catalyst"].forEach((value) => kind.append(new Option(value, value)));
    const direction = element("select");
    direction.append(new Option("supports", "support"), new Option("challenges", "challenge"));
    const confidence = element("input");
    confidence.type = "number";
    confidence.min = "0";
    confidence.max = "100";
    confidence.value = "70";
    const add = element("button", "accent-button", "Add claim");
    add.type = "submit";
    form.append(controlLabel("Claim", title), controlLabel("Source", source), controlLabel("Type", kind), controlLabel("Direction", direction), controlLabel("Confidence", confidence), add);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const validation = validateEvidenceDraft({ title: title.value, source: source.value, kind: kind.value, direction: direction.value, confidence: confidence.value });
      if (!validation.valid) {
        onStatus?.(validation.errors.join(" "));
        return;
      }
      state.evidence.unshift({
        id: `evidence-${Date.now()}`,
        ...validation.entry,
        link: context.marketState
          ? { timestamp: context.marketState.timestamp, spyReturn: context.marketState.spyReturn, breadthPct: context.marketState.breadthPct, experimentId: context.experimentId }
          : null
      });
      save("Claim saved with the selected market-state link");
      render();
    });
    evidencePanel.append(form);
    const evidenceList = element("div", "evidence-list");
    state.evidence.forEach((entry, index) => {
      const validation = validateEvidenceDraft(entry);
      if (!validation.valid) {
        return;
      }
      const item = element("article", `evidence-item ${validation.entry.direction}`);
      const copy = element("div");
      copy.append(element("h3", null, validation.entry.title));
      const details = `${validation.entry.direction === "challenge" ? "Challenges" : "Supports"} / ${validation.entry.kind} / ${validation.entry.confidence}% confidence${validation.entry.source ? ` / ${validation.entry.source}` : ""}`;
      copy.append(element("p", null, details));
      if (entry.link) {
        copy.append(element("p", null, `Linked market state: ${new Date(entry.link.timestamp).toLocaleString()} | SPY ${entry.link.spyReturn.toFixed(2)}% | breadth ${entry.link.breadthPct.toFixed(1)}%`));
      }
      const remove = element("button", "remove-button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => {
        state.evidence.splice(index, 1);
        save("Claim removed");
        render();
      });
      item.append(copy, remove);
      evidenceList.append(item);
    });
    evidencePanel.append(evidenceList);
    left.append(evidencePanel);

    const linkPanel = element("section", "notebook-panel");
    const linkHeading = element("div", "panel-heading compact");
    const linkCopy = element("div");
    linkCopy.append(element("p", "panel-kicker", "Linked evidence"), element("h2", null, "Current market context"));
    linkHeading.append(linkCopy);
    linkPanel.append(linkHeading);
    const link = element("div", "linked-moment");
    link.textContent = context.marketState
      ? `Selected ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(context.marketState.timestamp))} ET. SPY ${context.marketState.spyReturn.toFixed(2)}%, RSP-SPY ${context.marketState.rspSpyReturn.toFixed(2)}pp, breadth ${context.marketState.breadthPct.toFixed(1)}%.${context.experimentId ? ` Linked experiment: ${context.experimentId}.` : ""}`
      : "Choose a market moment or run an experiment to link this note to inspectable data.";
    linkPanel.append(link);
    right.append(linkPanel);

    const completenessPanel = element("section", "notebook-panel");
    const completenessHeading = element("div", "panel-heading compact");
    const completionCopy = element("div");
    completionCopy.append(element("p", "panel-kicker", "Explicit checklist"), element("h2", null, `Note completeness ${completeness.done}/${completeness.total}`));
    completenessHeading.append(completionCopy);
    completenessPanel.append(completenessHeading);
    const list = element("div", "completeness-list");
    completeness.items.forEach((item) => {
      const row = element("div", `completeness-item${item.done ? " is-done" : ""}`);
      row.append(element("span", null, item.label), element("strong", null, item.done ? "done" : "open"));
      list.append(row);
    });
    completenessPanel.append(list, element("p", "panel-note", completeness.note));
    right.append(completenessPanel);

    const falsifierPanel = element("section", "notebook-panel");
    const falsifierHeading = element("div", "panel-heading compact");
    const falsifierCopy = element("div");
    falsifierCopy.append(element("p", "panel-kicker", "Disconfirming conditions"), element("h2", null, "Falsifiers"));
    falsifierHeading.append(falsifierCopy);
    falsifierPanel.append(falsifierHeading);
    const falsifierForm = element("form", "falsifier-form");
    const falsifierText = element("input");
    falsifierText.required = true;
    falsifierText.maxLength = 220;
    falsifierText.placeholder = "Condition that would weaken this note";
    const monitorEnabled = element("input");
    monitorEnabled.type = "checkbox";
    const monitorField = element("select");
    Object.entries(MONITOR_FIELDS).forEach(([value, label]) => monitorField.append(new Option(label, value)));
    const monitorOperator = element("select");
    [">", ">=", "<", "<="].forEach((value) => monitorOperator.append(new Option(value, value)));
    const monitorThreshold = element("input");
    monitorThreshold.type = "number";
    monitorThreshold.step = "0.01";
    monitorThreshold.value = "0";
    const falsifierAdd = element("button", "accent-button", "Add falsifier");
    falsifierAdd.type = "submit";
    const structuredLabel = controlLabel("Structured monitor", monitorEnabled);
    structuredLabel.className = "checkbox-label";
    falsifierForm.append(
      controlLabel("Condition", falsifierText),
      structuredLabel,
      controlLabel("Field", monitorField),
      controlLabel("Operator", monitorOperator),
      controlLabel("Threshold", monitorThreshold),
      falsifierAdd
    );
    falsifierForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (falsifierText.value.trim().length < 4) {
        onStatus?.("Write a falsifier with at least four characters.");
        return;
      }
      const threshold = Number(monitorThreshold.value);
      if (monitorEnabled.checked && !Number.isFinite(threshold)) {
        onStatus?.("Structured falsifiers need a finite threshold.");
        return;
      }
      state.falsifiers.unshift({
        text: falsifierText.value.trim(),
        monitor: monitorEnabled.checked ? { field: monitorField.value, operator: monitorOperator.value, threshold } : null
      });
      save("Falsifier saved");
      render();
    });
    falsifierPanel.append(falsifierForm);
    const falsifierList = element("div", "falsifier-list");
    state.falsifiers.forEach((entry, index) => {
      const value = normalizeFalsifier(entry);
      const item = element("article", "falsifier-item");
      const copy = element("div");
      copy.append(element("strong", null, value.text), element("p", null, falsifierStatus(value, context.marketState)));
      const remove = element("button", "remove-button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => {
        state.falsifiers.splice(index, 1);
        save("Falsifier removed");
        render();
      });
      item.append(copy, remove);
      falsifierList.append(item);
    });
    falsifierPanel.append(falsifierList);
    right.append(falsifierPanel);

    layout.append(left, right);
    root.replaceChildren(layout);
  };

  render();
  return {
    setContext(nextContext) {
      context = { ...context, ...nextContext };
      render();
    },
    exportState() {
      return { state: clone(state), context: clone(context) };
    },
    reset() {
      state = clone(starterState);
      save("Starter notebook restored");
      render();
    }
  };
}
