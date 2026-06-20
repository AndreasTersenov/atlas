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
// env var to set when invoking locally.
const TARGET = process.env.ATLAS_TEST_TARGET === "ghpages" ? "ghpages" : "vercel";
const BASE_PATH = TARGET === "ghpages" ? "/atlas" : "";

// Mutating process.env at module-load time is the load-bearing line:
// tests/e2e/url.ts captures `process.env.NEXT_PUBLIC_ATLAS_BASE_PATH` at
// its own module scope. Playwright guarantees this config runs first, so
// url.ts sees the right value. The webServer subprocess inherits the env
// from this Node process when it forks, so `npm run build` also sees the
// right basePath — no shell prefix needed on the webServer command.
// Other runners (vitest, ad-hoc node scripts) don't guarantee config-first
// ordering; importing url.ts from those contexts without setting the env
// var yourself returns the empty basePath.
process.env.NEXT_PUBLIC_ATLAS_BASE_PATH = BASE_PATH;

// Enable test-only routes (e.g. /_smoke/explainer for RevealExplainer
// e2e). Read at build time by the gated pages; production CI does not
// set this so the routes never ship to atlas-rust-one.vercel.app or
// andreastersenov.github.io/atlas/.
process.env.ATLAS_TEST_ROUTES = "1";

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
// NEXT_PUBLIC_ATLAS_BASE_PATH is inherited from the Node parent's process.env
// (set on line 30 above) — no shell prefix needed. Keeping the source-of-
// truth single makes the basepath wiring grep-traceable to one line.
const ghpagesCmd =
  `npm run build && ` +
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
    // cold-starts. Two caveats worth knowing:
    //   1. Same-target staleness: a `serve` left running from a previous
    //      build serves stale out/ artifacts. Kill it before re-running
    //      on source change.
    //   2. Cross-target reuse trap: running `ATLAS_TEST_TARGET=ghpages
    //      npm run test:e2e` while any vercel-target `serve` is alive on
    //      port 3000 (e.g. from a side terminal during G.1.c.2 dev) causes
    //      Playwright to reuse the *wrong* server. The ghpages-target
    //      tests then hit /atlas/ against the vercel serve, get a 404,
    //      and fail with what looks like a build error rather than a
    //      clear "wrong configuration" signal. Kill any running `serve`
    //      instance before switching targets locally.
    reuseExistingServer: !process.env.CI,
    // Next build + asset copy can take ~30s on a cold CI cache.
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
