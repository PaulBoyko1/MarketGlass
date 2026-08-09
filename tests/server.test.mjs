import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createMarketGlassServer } from "../src/server.mjs";

const rootDir = path.resolve(".");

async function startServer(environment) {
  const records = await mkdtemp(path.join(os.tmpdir(), "marketglass-server-"));
  const server = createMarketGlassServer({ environment, rootDir, recordingsDir: records });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(records, { recursive: true, force: true });
    }
  };
}

test("server serves the workbench, analysis API, and key-safe health status", async () => {
  const instance = await startServer({ MARKETGLASS_DATA_MODE: "demo", MASSIVE_API_KEY: "do-not-leak" });
  try {
    const home = await fetch(`${instance.origin}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /market-state microscope/);
    assert.match(home.headers.get("content-security-policy"), /script-src 'self'/);

    const directIndex = await fetch(`${instance.origin}/web/index.html`);
    const directIndexMarkup = await directIndex.text();
    assert.equal(directIndex.status, 200);
    assert.doesNotMatch(directIndexMarkup, /__MARKETGLASS_CSP_NONCE__/);
    assert.match(directIndexMarkup, /nonce="[A-Za-z0-9+/=]+"/);

    const health = await fetch(`${instance.origin}/api/health`);
    const healthPayload = await health.json();
    assert.equal(health.status, 200);
    assert.equal(JSON.stringify(healthPayload).includes("do-not-leak"), false);

    const session = await fetch(`${instance.origin}/api/session?mode=demo`);
    const sessionPayload = await session.json();
    assert.equal(session.status, 200);
    assert.equal(sessionPayload.mode, "demo");
    assert.equal(sessionPayload.provenance.is_synthetic, true);
    assert.match(sessionPayload.data_hash, /^[a-f0-9]{64}$/);

    const callSurface = await fetch(`${instance.origin}/api/analysis/surface-quality?mode=demo&index=4&type=call`);
    const callSurfacePayload = await callSurface.json();
    assert.equal(callSurface.status, 200);
    assert.ok(callSurfacePayload.quality.rawCount > 0);
    assert.equal(callSurfacePayload.quality.maturities, 3);

    const recorded = await fetch(`${instance.origin}/api/records`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "demo" })
    });
    const recordedPayload = await recorded.json();
    assert.equal(recorded.status, 201);
    const replayed = await fetch(`${instance.origin}/api/session?mode=recorded&recording=${encodeURIComponent(recordedPayload.id)}`);
    const replayedPayload = await replayed.json();
    assert.equal(replayed.status, 200);
    assert.equal(replayedPayload.mode, "recorded");
    assert.equal(replayedPayload.data_hash, recordedPayload.data_hash);
    const replayedState = await fetch(`${instance.origin}/api/analysis/state?mode=recorded&recording=${encodeURIComponent(recordedPayload.id)}&index=4`);
    assert.equal(replayedState.status, 200);

    const experiment = await fetch(`${instance.origin}/api/analysis/experiment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        relatedTests: 2,
        spec: {
          conditions: [{ field: "breadthPct", operator: "<", threshold: 50 }],
          target: { field: "forwardReturn60m", horizonMinutes: 60 }
        }
      })
    });
    const experimentPayload = await experiment.json();
    assert.equal(experiment.status, 200);
    assert.equal(experimentPayload.experiment.validation.multiple_testing_risk, "elevated");
    assert.equal(experimentPayload.experiment.data_hash, sessionPayload.data_hash);
    assert.notEqual(experimentPayload.experiment.run_timestamp, "2026-08-09T00:00:00.000Z");

    const recordedExperiment = await fetch(`${instance.origin}/api/analysis/experiment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataMode: "recorded",
        recording: recordedPayload.id,
        spec: {
          conditions: [{ field: "breadthPct", operator: "<", threshold: 50 }],
          target: { field: "forwardReturn60m", horizonMinutes: 60 }
        }
      })
    });
    const recordedExperimentPayload = await recordedExperiment.json();
    assert.equal(recordedExperiment.status, 200);
    assert.equal(recordedExperimentPayload.experiment.data_hash, recordedPayload.data_hash);
    assert.match(recordedExperimentPayload.experiment.data_source, new RegExp(recordedPayload.id));

    const invalidIndex = await fetch(`${instance.origin}/api/analysis/state?mode=demo&index=not-a-number`);
    const invalidIndexPayload = await invalidIndex.json();
    assert.equal(invalidIndex.status, 400);
    assert.equal(invalidIndexPayload.error.code, "invalid_input");

    const invalidPnl = await fetch(`${instance.origin}/api/analysis/pnl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataMode: "demo", position: { strike: -1 } })
    });
    const invalidPnlPayload = await invalidPnl.json();
    assert.equal(invalidPnl.status, 400);
    assert.equal(invalidPnlPayload.error.code, "invalid_input");

    const free = await fetch(`${instance.origin}/api/session?mode=free`);
    const freePayload = await free.json();
    assert.equal(free.status, 503);
    assert.equal(freePayload.error.code, "synchronized_session_unavailable");

    const traversal = await fetch(`${instance.origin}/web/..%2FREADME.md`);
    assert.ok([403, 404].includes(traversal.status));
  } finally {
    await instance.close();
  }
});
