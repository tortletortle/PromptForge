import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const databasePath = resolve(process.cwd(), ".tmp", "promptforge-e2e.sqlite");

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:4317/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "4317",
        PROMPTFORGE_DB_PATH: databasePath
      }
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
});
