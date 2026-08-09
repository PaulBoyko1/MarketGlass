import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeRecordingId(value) {
  const id = String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id || id.length > 80) {
    throw new Error("Recording id must contain 1-80 letters, digits, or dashes.");
  }
  return id;
}

export class RecordingStore {
  constructor(directory) {
    this.directory = directory;
  }

  async list() {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/, ""))
      .sort();
  }

  async save(id, session, metadata = {}) {
    const safeId = safeRecordingId(id);
    await mkdir(this.directory, { recursive: true });
    const data = JSON.stringify(session);
    const record = {
      id: safeId,
      captured_at: new Date().toISOString(),
      data_hash: createHash("sha256").update(data).digest("hex"),
      source: metadata.source ?? "MarketGlass local recorder",
      interval_minutes: session.interval_minutes,
      session
    };
    await writeFile(path.join(this.directory, `${safeId}.json`), JSON.stringify(record, null, 2) + "\n", "utf8");
    return { id: safeId, data_hash: record.data_hash, captured_at: record.captured_at };
  }

  async read(id) {
    const safeId = safeRecordingId(id);
    const raw = await readFile(path.join(this.directory, `${safeId}.json`), "utf8");
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      throw new Error("Recording is not valid JSON.");
    }
    if (!record || typeof record !== "object" || !record.session || typeof record.data_hash !== "string") {
      throw new Error("Recording is missing its session or integrity hash.");
    }
    const actualHash = createHash("sha256").update(JSON.stringify(record.session)).digest("hex");
    if (actualHash !== record.data_hash) {
      throw new Error("Recording integrity check failed.");
    }
    return record;
  }
}
