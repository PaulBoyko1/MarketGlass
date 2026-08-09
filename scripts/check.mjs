import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["src", "web", "tests"];
const explicitFiles = ["app.js", "data.js", "logic.mjs"];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(absolute)));
    } else if (/\.(?:mjs|js)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${file}`))));
  });
}

const discovered = (await Promise.all(roots.map((directory) => collect(path.join(root, directory))))).flat();
const files = [...explicitFiles.map((file) => path.join(root, file)), ...discovered];
for (const file of files) {
  await check(file);
}

console.log(`Syntax checked ${files.length} JavaScript modules.`);
