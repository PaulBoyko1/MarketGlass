import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 35_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node src/server.mjs",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, MARKETGLASS_PORT: "4174" },
    timeout: 30_000
  }
});
