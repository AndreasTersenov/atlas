// Playwright config for Atlas v2 — see docs/V2_SHOWCASE_PLAN.md §G.0 + AGENTS.md
// "Tests are not optional".
//
// This is the stack-proof config: just enough that one e2e test runs locally
// and in CI. It expands as v2 features land.
//
// webServer: `npm run dev` for now (Turbopack, fast cold start). When the v2
// MVP wires `output: 'export'` we switch to serving `out/` directly so the
// tests verify what we actually ship to GitHub Pages.

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Some flakiness budget on CI for cold-start; locally fail fast.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],

  use: {
    baseURL,
    // Capture trace + screenshot on first retry so CI failures are debuggable
    // without re-running. Per AGENTS.md "Evidence over assertion".
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Next + Turbopack first build can be slow on CI cold cache.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
