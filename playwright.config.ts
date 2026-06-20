// Playwright config for Atlas v2 — see docs/V2_SHOWCASE_PLAN.md §G.0 + AGENTS.md
// "Tests are not optional".
//
// As of G.1.a (next.config migration), webServer builds the static export and
// serves out/. This is what we actually ship to both Vercel and GH Pages, so
// the green check now means the production runtime renders — not just dev.
// The earlier dev-server-backed setup conflated two different guarantees;
// see docs/G0_PR_REVIEW.md §1.1 for the staff-engineer review that prompted
// the switch.

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
    // Build the static export, then serve out/ with `serve` (no Next
    // runtime needed). This is the same artifact that goes to Vercel +
    // GH Pages — the green check now means the production runtime works.
    // Locally, reuse a running server so iterative test runs don't rebuild
    // every time; on CI always cold-start so we test the actual build.
    command: `npm run build && npx serve out -l ${PORT} --no-port-switching --no-clipboard`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Next build can take ~30s on a cold CI cache; allow generous headroom.
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
