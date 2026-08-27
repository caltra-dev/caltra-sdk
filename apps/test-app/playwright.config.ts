import { defineConfig } from "@playwright/test";

const configured = Boolean(
  process.env.CALTRA_API_KEY
  && process.env.CALTRA_WORKSPACE_ID,
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: configured
    ? {
        command: "npm run dev",
        reuseExistingServer: true,
        timeout: 30_000,
        url: "http://127.0.0.1:5173",
      }
    : undefined,
});
