import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getDemoSession } from "../src/core/demo-data.mjs";
import { RecordingStore } from "../src/store/recordings.mjs";

test("recordings round-trip only with the matching content hash", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "marketglass-recording-"));
  try {
    const store = new RecordingStore(directory);
    const saved = await store.save("My SPY Demo", getDemoSession(), { source: "test" });
    const loaded = await store.read(saved.id);

    assert.equal(saved.id, "my-spy-demo");
    assert.equal(loaded.data_hash, saved.data_hash);
    assert.deepEqual(await store.list(), [saved.id]);

    const filename = path.join(directory, `${saved.id}.json`);
    const corrupted = JSON.parse(await readFile(filename, "utf8"));
    corrupted.session.title = "tampered";
    await writeFile(filename, JSON.stringify(corrupted), "utf8");
    await assert.rejects(() => store.read(saved.id), /integrity check failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
