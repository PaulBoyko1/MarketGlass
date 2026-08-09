import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDemoSession } from "./core/demo-data.mjs";
import { GAMMA_MODES, gammaExposureByStrike } from "./core/gamma.mjs";
import { findAnalogues, proposeSpecFromObservation, runChronologicalExperiment } from "./core/hypotheses.mjs";
import { compareMoments, marketStateAt, surfaceQuality } from "./core/market.mjs";
import { scenarioPnlSurface } from "./core/options.mjs";
import { assertDataMode } from "./core/schema.mjs";
import { ProviderError } from "./providers/base.mjs";
import { createProviderRegistry } from "./providers/registry.mjs";
import { RecordingStore } from "./store/recordings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp"
};

function loadDotEnv(environment, filename = path.join(root, ".env")) {
  if (!existsSync(filename)) {
    return;
  }
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !environment[match[1]]) {
      environment[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function safeMessage(error) {
  if (error instanceof ProviderError) {
    return error.toSafeJson();
  }
  return { code: "request_failed", message: "MarketGlass could not complete that local request." };
}

function serve(response, file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    json(response, 404, { error: { code: "not_found", message: "Asset not found." } });
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache"
  });
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!response.headersSent) {
      json(response, 500, { error: { code: "asset_read_failed", message: "Asset could not be read." } });
    } else {
      response.destroy();
    }
  });
  stream.pipe(response);
}

function serveIndex(response, file, nonce) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    json(response, 404, { error: { code: "not_found", message: "Asset not found." } });
    return;
  }
  const body = readFileSync(file, "utf8").replaceAll("__MARKETGLASS_CSP_NONCE__", nonce);
  response.writeHead(200, {
    "content-type": contentTypes[".html"],
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache"
  });
  response.end(body);
}

function safeStaticFile(directory, requestedPath) {
  const file = path.resolve(directory, requestedPath);
  const relative = path.relative(directory, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return file;
}

function parseBody(request, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Malformed JSON."));
      }
    });
    request.on("error", reject);
  });
}

function modeSession(mode, recordingId, recordings) {
  if (mode === "recorded" && recordingId) {
    return recordings.read(recordingId).then((record) => ({
      ...record.session,
      mode: "recorded",
      recording: {
        id: record.id,
        captured_at: record.captured_at,
        data_hash: record.data_hash,
        source: record.source
      }
    }));
  }
  if (mode === "demo") {
    return Promise.resolve({ ...getDemoSession(), mode: "demo" });
  }
  if (mode === "recorded") {
    const session = getDemoSession();
    return Promise.resolve({
      ...session,
      mode: "recorded",
      title: "Recorded demo fixture",
      provenance: { ...session.provenance, calculation: "recorded deterministic demo fixture" }
    });
  }
  throw new ProviderError(
    "MarketGlass",
    "synchronized_session_unavailable",
    `${mode.toUpperCase()} mode needs a configured, licensed synchronized collection pipeline; MarketGlass will not relabel its synthetic fixture as live data.`,
    { status: 503 }
  );
}

function attachSessionDataHash(session) {
  const { data_hash: _existingHash, recording, ...content } = session;
  const dataHash = recording?.data_hash ?? createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return { ...content, ...(recording ? { recording } : {}), data_hash: dataHash };
}

function invalidInput(message) {
  return new ProviderError("MarketGlass", "invalid_input", message, { status: 400 });
}

function timelineIndex(session, value, fallback = 0) {
  const raw = value == null ? fallback : Number(value);
  if (!Number.isFinite(raw)) {
    throw invalidInput("Timeline index must be a finite number.");
  }
  return Math.max(0, Math.min(session.timeline.length - 1, Math.trunc(raw)));
}

function finiteInput(value, { fallback, field, minimum = -Infinity, maximum = Infinity, integer = false }) {
  const raw = value == null ? fallback : Number(value);
  if (!Number.isFinite(raw) || raw < minimum || raw > maximum || (integer && !Number.isInteger(raw))) {
    const range = `${minimum === -Infinity ? "" : ` at least ${minimum}`}${minimum !== -Infinity && maximum !== Infinity ? " and" : ""}${maximum === Infinity ? "" : ` at most ${maximum}`}`;
    throw invalidInput(`${field} must be a finite${integer ? " integer" : ""}${range ? ` number${range}` : " number"}.`);
  }
  return raw;
}

function selectedStateForAnalogue(session, index) {
  const state = marketStateAt(session, index);
  return {
    sequence: index,
    timestamp: state.timestamp,
    features: {
      spyReturn30m: state.spyReturn30m ?? 0,
      rspSpyReturn30m: state.rspSpyReturn30m ?? 0,
      breadthPct: state.breadthPct,
      ivChange: state.ivChange,
      realizedVol: state.realizedVol ?? 0,
      sectorDispersion: state.sectorDispersion,
      relativeVolume: state.relativeVolume
    },
    targets: {}
  };
}

export function createMarketGlassServer({ environment = { ...process.env }, fetchFn, rootDir = root, recordingsDir } = {}) {
  loadDotEnv(environment, path.join(rootDir, ".env"));
  const registry = createProviderRegistry(environment, { fetchFn });
  const recordings = new RecordingStore(recordingsDir ?? path.join(rootDir, "records"));
  const resolveSession = (input, fallbackMode = "demo") => {
    const read = (name) => typeof input?.get === "function" ? input.get(name) : input?.[name];
    const mode = assertDataMode(read("dataMode") ?? read("mode") ?? fallbackMode);
    return modeSession(mode, read("recording"), recordings).then(attachSessionDataHash);
  };
  return createHttpServer(async (request, response) => {
    const nonce = randomBytes(18).toString("base64");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-security-policy", `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'none'`);
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, registry.health());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        const session = await resolveSession(url.searchParams, environment.MARKETGLASS_DATA_MODE ?? "demo");
        json(response, 200, session);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/records") {
        json(response, 200, { recordings: await recordings.list() });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/records") {
        const body = await parseBody(request);
        if (body.source !== "demo") {
          json(response, 400, { error: { code: "record_source_restricted", message: "This local recorder currently records the selected demo session only." } });
          return;
        }
        const session = getDemoSession();
        const captured = new Date().toISOString().replaceAll(/[:.]/g, "-");
        const id = body.id ?? `recorded-${captured}-spy`;
        json(response, 201, await recordings.save(id, session, { source: "MarketGlass synthetic demo recorder" }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/analysis/state") {
        const session = await resolveSession(url.searchParams);
        const index = timelineIndex(session, url.searchParams.get("index"));
        json(response, 200, { state: marketStateAt(session, index) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/analysis/compare") {
        const session = await resolveSession(url.searchParams);
        const left = timelineIndex(session, url.searchParams.get("left"));
        const right = timelineIndex(session, url.searchParams.get("right"), session.timeline.length - 1);
        json(response, 200, { comparison: compareMoments(marketStateAt(session, left), marketStateAt(session, right)) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/analysis/surface-quality") {
        const session = await resolveSession(url.searchParams);
        const index = timelineIndex(session, url.searchParams.get("index"));
        const type = url.searchParams.get("type");
        const chain = session.optionSnapshots[session.timeline[index].timestamp].filter((item) => type === "call" || type === "put" ? item.type === type : true);
        json(response, 200, { quality: surfaceQuality(chain) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/observation") {
        const body = await parseBody(request);
        const session = await resolveSession(body);
        const start = marketStateAt(session, timelineIndex(session, body.start));
        const end = marketStateAt(session, timelineIndex(session, body.end));
        json(response, 200, { proposal: proposeSpecFromObservation(start, end) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/experiment") {
        const body = await parseBody(request);
        const session = await resolveSession(body);
        const experiment = runChronologicalExperiment(session.history, body.spec, {
          dataSource: session.mode === "recorded"
            ? `Recorded MarketGlass session: ${session.recording?.id ?? session.id}`
            : "MarketGlass synthetic historical state fixture",
          dataHash: session.data_hash,
          softwareCommit: environment.GITHUB_SHA ?? "local-working-tree",
          relatedTests: body.relatedTests ?? 1
        });
        json(response, 200, { experiment });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/analogues") {
        const body = await parseBody(request);
        const session = await resolveSession(body);
        const selected = selectedStateForAnalogue(session, timelineIndex(session, body.index));
        json(response, 200, { selected, analogues: findAnalogues(session.history, selected, { pastOnly: true, limit: 8 }) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/gamma") {
        const body = await parseBody(request);
        const session = await resolveSession(body);
        const index = timelineIndex(session, body.index);
        const mode = body.mode ?? "unsigned";
        if (!Object.hasOwn(GAMMA_MODES, mode)) {
          throw invalidInput("Gamma mode is not supported.");
        }
        const chain = session.optionSnapshots[session.timeline[index].timestamp].filter((item) => item.expiration === "2026-08-10");
        json(response, 200, { exposure: gammaExposureByStrike(chain, { mode, spot: session.timeline[index].underlyings.SPY }) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/pnl") {
        const body = await parseBody(request);
        const session = await resolveSession(body);
        const index = timelineIndex(session, body.index);
        const hours = finiteInput(body.position?.hours, { fallback: 2.5, field: "Hours remaining", minimum: 0.25, maximum: 24 * 365 });
        const position = {
          type: body.position?.type === "put" ? "put" : "call",
          side: "long",
          strike: finiteInput(body.position?.strike, { fallback: session.timeline[index].underlyings.SPY, field: "Strike", minimum: 0.01, maximum: 1_000_000 }),
          quantity: finiteInput(body.position?.quantity, { fallback: 1, field: "Quantity", minimum: 1, maximum: 100_000, integer: true }),
          multiplier: 100,
          volatility: finiteInput(body.position?.volatility, { fallback: session.timeline[index].volatility.atmIv, field: "Volatility", minimum: 0.0001, maximum: 5 }),
          time: hours / (365 * 24)
        };
        json(response, 200, { surface: scenarioPnlSurface({ position, spot: session.timeline[index].underlyings.SPY, rate: session.assumptions.rate, dividend: session.assumptions.dividend }) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/options/chain") {
        const symbol = url.searchParams.get("symbol") ?? "SPY";
        const expiration = url.searchParams.get("expiration") ?? "";
        json(response, 200, await registry.optionChain(symbol, expiration));
        return;
      }
      if (request.method !== "GET") {
        json(response, 405, { error: { code: "method_not_allowed", message: "Unsupported HTTP method." } });
        return;
      }
      const requested = decodeURIComponent(url.pathname);
      if (requested === "/" || requested === "/index.html" || requested === "/web/index.html") {
        serveIndex(response, path.join(rootDir, "web", "index.html"), nonce);
        return;
      }
      const roots = [
        ["/web/", path.join(rootDir, "web")],
        ["/vendor/three/", path.join(rootDir, "node_modules", "three")]
      ];
      for (const [prefix, directory] of roots) {
        if (requested.startsWith(prefix)) {
          const relative = requested.slice(prefix.length);
          const file = safeStaticFile(directory, relative);
          if (!file) {
            json(response, 403, { error: { code: "forbidden", message: "Invalid asset path." } });
            return;
          }
          serve(response, file);
          return;
        }
      }
      if (["/logic.mjs", "/data.js"].includes(requested)) {
        serve(response, path.join(rootDir, requested.slice(1)));
        return;
      }
      json(response, 404, { error: { code: "not_found", message: "Route not found." } });
    } catch (error) {
      json(response, error instanceof ProviderError ? error.status ?? 502 : 400, { error: safeMessage(error) });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MARKETGLASS_PORT ?? 4173);
  const server = createMarketGlassServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`MarketGlass is available at http://127.0.0.1:${port}`);
  });
}
