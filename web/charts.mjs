const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function extent(values) {
  const usable = values.filter(Number.isFinite);
  const minimum = Math.min(...usable);
  const maximum = Math.max(...usable);
  const padding = Math.max(0.05, (maximum - minimum) * 0.12);
  return { minimum: minimum - padding, maximum: maximum + padding };
}

function linePath(values, scaleX, scaleY) {
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${scaleX(index).toFixed(2)} ${scaleY(value).toFixed(2)}`).join(" ");
}

function createSvg(container, label, width = 1000, height = 350) {
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": label, preserveAspectRatio: "none" });
  container.replaceChildren(svg);
  return { svg, width, height };
}

export function renderMarketChart(container, session, selectedIndex, observation, onSelect) {
  const { svg, width, height } = createSvg(container, "SPY, RSP, and breadth participation through the recorded session");
  const padding = { left: 48, right: 18, top: 20, bottom: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const start = session.timeline[0];
  const spy = session.timeline.map((row) => ((row.underlyings.SPY / start.underlyings.SPY) - 1) * 100);
  const rsp = session.timeline.map((row) => ((row.underlyings.RSP / start.underlyings.RSP) - 1) * 100);
  const breadth = session.timeline.map((row) => (row.breadth.positivePct - 50) / 15);
  const domain = extent([...spy, ...rsp, ...breadth]);
  const x = (index) => padding.left + (index / (session.timeline.length - 1)) * chartWidth;
  const y = (value) => padding.top + ((domain.maximum - value) / (domain.maximum - domain.minimum)) * chartHeight;

  for (let row = 0; row <= 4; row += 1) {
    const value = domain.minimum + ((domain.maximum - domain.minimum) * row) / 4;
    const yValue = y(value);
    svg.append(svgElement("line", { x1: padding.left, y1: yValue, x2: width - padding.right, y2: yValue, stroke: "#2b302b", "stroke-width": 1 }));
    const label = svgElement("text", { x: 4, y: yValue + 3, fill: "#a4aaa1", "font-size": 10 });
    label.textContent = `${value.toFixed(1)}%`;
    svg.append(label);
  }
  for (let column = 0; column <= 4; column += 1) {
    const index = Math.round(((session.timeline.length - 1) * column) / 4);
    const xValue = x(index);
    svg.append(svgElement("line", { x1: xValue, y1: padding.top, x2: xValue, y2: height - padding.bottom, stroke: "#252a25", "stroke-width": 1 }));
    const label = svgElement("text", { x: xValue, y: height - 10, fill: "#a4aaa1", "font-size": 10, "text-anchor": "middle" });
    label.textContent = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(session.timeline[index].timestamp));
    svg.append(label);
  }
  const left = Math.min(observation.start, observation.end);
  const right = Math.max(observation.start, observation.end);
  svg.append(svgElement("rect", { x: x(left), y: padding.top, width: Math.max(2, x(right) - x(left)), height: chartHeight, fill: "#4dc2ae", opacity: 0.09 }));
  for (const [values, color, widthValue] of [[spy, "#4dc2ae", 2.3], [rsp, "#75b9e6", 2.1], [breadth, "#f0b35c", 1.8]]) {
    svg.append(svgElement("path", { d: linePath(values, x, y), fill: "none", stroke: color, "stroke-width": widthValue, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }
  const selectedX = x(selectedIndex);
  svg.append(svgElement("line", { x1: selectedX, y1: padding.top, x2: selectedX, y2: height - padding.bottom, stroke: "#f3f4ec", "stroke-width": 1.4, "stroke-dasharray": "4 4" }));
  for (const event of session.events) {
    const marker = svgElement("line", { x1: x(event.index), y1: padding.top, x2: x(event.index), y2: padding.top + 8, stroke: "#f0b35c", "stroke-width": 2 });
    svg.append(marker);
  }
  const hitArea = svgElement("rect", { x: padding.left, y: padding.top, width: chartWidth, height: chartHeight, fill: "transparent" });
  hitArea.style.cursor = "crosshair";
  hitArea.addEventListener("pointermove", (event) => {
    const rect = svg.getBoundingClientRect();
    const value = Math.round(((event.clientX - rect.left) / rect.width) * (session.timeline.length - 1));
    onSelect(Math.max(0, Math.min(session.timeline.length - 1, value)));
  });
  svg.append(hitArea);
}

export function renderGammaChart(container, rows, mode) {
  const { svg, width, height } = createSvg(container, "Gamma exposure by strike");
  const padding = { left: 48, right: 18, top: 20, bottom: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = rows.map((row) => (mode === "unsigned" ? row.magnitude : row.signed));
  const maximum = Math.max(...values.map(Math.abs), 1);
  const zero = padding.top + innerHeight / 2;
  svg.append(svgElement("line", { x1: padding.left, y1: zero, x2: width - padding.right, y2: zero, stroke: "#697269", "stroke-width": 1 }));
  const barWidth = innerWidth / rows.length;
  rows.forEach((row, index) => {
    const value = mode === "unsigned" ? row.magnitude : row.signed;
    const heightValue = (Math.abs(value) / maximum) * (innerHeight / 2 - 12);
    const y = value >= 0 ? zero - heightValue : zero;
    const bar = svgElement("rect", { x: padding.left + index * barWidth + 2, y, width: Math.max(2, barWidth - 4), height: heightValue, fill: value >= 0 ? "#4dc2ae" : "#ed7d6f" });
    svg.append(bar);
    if (index % 2 === 0) {
      const label = svgElement("text", { x: padding.left + index * barWidth + barWidth / 2, y: height - 10, fill: "#a4aaa1", "font-size": 9, "text-anchor": "middle" });
      label.textContent = row.strike;
      svg.append(label);
    }
  });
}

export function renderDistribution(container, values) {
  const { svg, width, height } = createSvg(container, "Historical outcome distribution");
  const padding = { left: 44, right: 18, top: 20, bottom: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  if (!values.length) {
    const message = svgElement("text", { x: width / 2, y: height / 2, fill: "#a4aaa1", "font-size": 14, "text-anchor": "middle" });
    message.textContent = "Run a structured experiment to inspect its distribution.";
    svg.append(message);
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const start = min === max ? min - 1 : min;
  const end = min === max ? max + 1 : max;
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const value of values) {
    const index = Math.min(buckets.length - 1, Math.max(0, Math.floor(((value - start) / (end - start)) * buckets.length)));
    buckets[index] += 1;
  }
  const maxBucket = Math.max(...buckets, 1);
  const barWidth = innerWidth / buckets.length;
  const zeroX = padding.left + ((0 - start) / (end - start)) * innerWidth;
  svg.append(svgElement("line", { x1: zeroX, y1: padding.top, x2: zeroX, y2: height - padding.bottom, stroke: "#f0b35c", "stroke-width": 1, "stroke-dasharray": "4 3" }));
  buckets.forEach((count, index) => {
    const barHeight = (count / maxBucket) * innerHeight;
    svg.append(svgElement("rect", { x: padding.left + index * barWidth + 2, y: height - padding.bottom - barHeight, width: Math.max(2, barWidth - 4), height: barHeight, fill: "#75b9e6" }));
  });
  for (const value of [start, 0, end]) {
    const x = padding.left + ((value - start) / (end - start)) * innerWidth;
    const label = svgElement("text", { x, y: height - 10, fill: "#a4aaa1", "font-size": 10, "text-anchor": "middle" });
    label.textContent = `${value.toFixed(2)}%`;
    svg.append(label);
  }
}
