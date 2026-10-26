import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const runtime = JSON.parse(
  readFileSync(resolve("../../.context/local-dev/runtime.json"), "utf8"),
);
process.env.PLAYWRIGHT_LLM_BASE_URL = new URL(
  runtime.OPENAI_COMPATIBLE_BASE_URL,
).origin;

export default defineConfig({
  testDir: "./__tests__/playwright",
  testMatch: "emulated/cleanup/mail-triage.spec.ts",
  outputDir: ".tmp/native-browser-results",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  globalTimeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: runtime.NEXT_PUBLIC_BASE_URL,
    storageState: resolve("../../.tmp/demo-screenshots/auth.json"),
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: {
      executablePath:
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    },
    screenshot: "only-on-failure",
  },
});
