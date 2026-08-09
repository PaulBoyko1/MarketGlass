import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const web = path.join(root, "web");

const [index, app] = await Promise.all([
  readFile(path.join(web, "index.html"), "utf8"),
  readFile(path.join(web, "app.mjs"), "utf8")
]);

if (!index.includes('id="marketglass-app"')) {
  throw new Error("Build aborted: MarketGlass application root is missing.");
}
if (!app.includes("bootstrap")) {
  throw new Error("Build aborted: frontend bootstrap is missing.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(web, path.join(dist, "web"), { recursive: true });
await cp(path.join(root, "logic.mjs"), path.join(dist, "logic.mjs"));
await cp(path.join(root, "data.js"), path.join(dist, "data.js"));
await writeFile(
  path.join(dist, "manifest.json"),
  JSON.stringify({ name: "marketglass", build: "local", entry: "/web/index.html" }, null, 2) + "\n"
);

console.log("Built static MarketGlass client to dist/.");
