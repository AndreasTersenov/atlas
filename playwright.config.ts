// Playwright config for Atlas v2. Drives both deploy targets:
//
//   - Vercel (default): no basePath, baseURL = http://localhost:PORT/
//   - GH Pages       : NEXT_PUBLIC_ATLAS_BASE_PATH=/atlas, baseURL =
//                       http://localhost:PORT/, served from a mount dir so
//                       /atlas/p/bnt-cnn/ resolves correctly.
//
// The same test files run against both — tests use the `p()` helper in
// tests/e2e/url.ts to prepend basePath where relevant. See
// docs/G0_PR_REVIEW.md §1.1 (production-runtime guarantee) and
// docs/G1b_PR_REVIEW.md §S5 (basePath CI gate must exist before G.1.c).

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Switched via env var so the same config drives both CI matrix legs.
// ATLAS_TEST_TARGET=ghpages → build + mount + serve under /atlas/.
// Anything else (including unset) → the default Vercel-target build.
//
// BASE_PATH is derived from TARGET here, then exported into process.env so
// tests/e2e/url.ts reads the same value. Single source of truth, single
// env var to set when invoking locally. Without this, the runner and the
// build subprocess could disagree (the build would get the basePath via
// the `VAR=…` shell prefix, but the runner's process.env would be empty
// and `p("/")` would return `/`, not `/atlas/`).
const TARGET = process.env.ATLAS_TEST_TARGET === "ghpages" ? "ghpages" : "vercel";
const BASE_PATH = TARGET === "ghpages" ? "/atlas" : "";
process.env.NEXT_PUBLIC_ATLAS_BASE_PATH = BASE_PATH;

// webServer commands. Both use `exec` so SIGTERM from Playwright lands on
// `serve` directly rather than the parent shell (otherwise an orphan can
// hold the port and the next run fails as EADDRINUSE masquerading as a
// build problem). See G1a_PR_REVIEW.md §1.4.
const vercelCmd =
  `npm run build && ` +
  `exec npx serve out -l ${PORT} --no-port-switching --no-clipboard`;

// For the GH-Pages target: build with the basePath set, then stage out/ at
// .test-mount<BASE_PATH>/ so a request for <BASE_PATH>/p/bnt-cnn/ resolves
// correctly against `serve`'s default file-system lookup. (serve has no
// URL rewrite.) We can't run two builds in parallel locally — the build
// clobbers out/ — but in CI the two targets run in separate jobs so
// there's no conflict.
const ghpagesCmd =
  `NEXT_PUBLIC_ATLAS_BASE_PATH=${BASE_PATH} npm run build && ` +
  `rm -rf .test-mount && mkdir -p .test-mount${BASE_PATH} && ` +
  `cp -r out/. .test-mount${BASE_PATH}/ && ` +
  `exec npx serve .test-mount -l ${PORT} --no-port-switching --no-clipboard`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],

  use: {
    baseURL: BASE_URL,
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
    command: TARGET === "ghpages" ? ghpagesCmd : vercelCmd,
    url: BASE_URL,
    // Locally reuse a running server to skip the rebuild step. CI always
    // cold-starts. Caveat: a stale `serve` from a previous build serves
    // stale out/ artifacts — kill it before re-running on source change.
    reuseExistingServer: !process.env.CI,
    // Next build + asset copy can take ~30s on a cold CI cache.
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
