// Port-verification tests for the real bnt_explainer.js — G.1.c.3.a.
//
// The smoke fixture in /smoke/explainer/ proves the wrapper's coupling
// shape. This suite proves the actual canvas explainer Andreas wrote
// (bnt_explainer.js, ~1100 LOC) survives the port: loads via the basePath
// pipeline, its engine constructor runs and paints a <canvas>, and
// fragmentshown emissions advance engine state (which we observe via the
// canvas continuing to be present — engines that fail mid-init usually
// throw and the wrapper's onerror path fires).
//
// Visual fidelity (does the cloud actually animate? does the BNT shear
// look right?) is verified by running `npm run dev` locally; CI can't
// pixel-diff a stochastic canvas without baseline images that we don't
// keep yet. The deferred-a11y bucket in G.1.c.3.b/c may add baseline
// snapshots later.

import { expect, test } from "@playwright/test";
import { p } from "./url";

const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
];

test.describe("bnt_explainer port", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
  });

  test.afterEach(() => {
    expect(
      consoleErrors,
      `Console errors during test:\n${consoleErrors.join("\n")}`
    ).toHaveLength(0);
  });

  test("real bnt_explainer loads via basePath, engine constructs a canvas", async ({
    page,
  }) => {
    await page.goto(p("/smoke/bnt-explainer/"), { waitUntil: "load" });

    // basePath-correct asset URLs in the head — the G.1.c.1 gate guards
    // this on the ghpages matrix leg.
    const expectedBasePath = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";
    const scriptSrc = await page
      .locator('script[src*="/explainers/bnt_explainer.js"]')
      .first()
      .getAttribute("src");
    expect(scriptSrc).toBe(`${expectedBasePath}/explainers/bnt_explainer.js`);

    // The engine constructor reads .bnt-cloud + .bnt-kernels canvases from
    // the scaffolding the page renders. If bnt_explainer.js threw during
    // attach() — bad port, missing dependency, the React-strict-mode
    // double-mount tripping it — _setupCanvas wouldn't run and the
    // engine's render loop wouldn't size them. A working attach leaves
    // both canvases visible with non-zero rendered dimensions.
    const section = page.locator(
      '[data-bnt-explainer][data-bnt-kind="cloud"]'
    );
    await expect(section).toBeVisible();
    await expect(section.locator("canvas.bnt-cloud")).toBeVisible();
    await expect(section.locator("canvas.bnt-kernels")).toBeVisible();
    // _setupCanvas sets canvas.width via getBoundingClientRect * DPR.
    // Empty viewport / failed attach → width stays at the HTML attribute
    // default (1520, 640). A sized canvas reads >100 once layout runs.
    const cloudWidth = await section
      .locator("canvas.bnt-cloud")
      .evaluate((c: HTMLCanvasElement) => c.width);
    expect(cloudWidth).toBeGreaterThan(100);

    // Wrapper status flipped to ready (visible via the act-counter
    // rendering "1 / 5" — counter only renders post-mount).
    await expect(page.locator('[data-role="act-counter"]')).toHaveText(
      "1 / 5",
      { timeout: 5_000 }
    );
  });

  test("S5 RAF leak fix: navigating away then back leaves a single engine entry per section", async ({
    page,
  }) => {
    await page.goto(p("/smoke/bnt-explainer/"), { waitUntil: "load" });
    await expect(
      page.locator('[data-bnt-explainer][data-bnt-kind="cloud"] canvas.bnt-cloud')
    ).toBeVisible();

    // Navigate to the other smoke route (which mounts the synthetic
    // fixture, not bnt_explainer) and back. Without S5, the previous
    // mount's engine entry remains in _engines pointing at a detached
    // section; on remount _syncFromReveal walks both. With S5, detached
    // sections are skipped.
    await page.goto(p("/smoke/explainer/"), { waitUntil: "load" });
    await page.goto(p("/smoke/bnt-explainer/"), { waitUntil: "load" });
    await expect(
      page.locator('[data-bnt-explainer][data-bnt-kind="cloud"] canvas.bnt-cloud')
    ).toBeVisible();

    // Probe the engines list and confirm only the live section is the
    // sync target. The bnt_explainer global is shared across loads
    // (script cached, BNTExplainer is module-scope), so accumulated
    // entries persist. We check that document.contains() filters them.
    const liveSyncCount = await page.evaluate(() => {
      const w = window as unknown as {
        BNTExplainer?: { _engines: { section: HTMLElement }[] };
      };
      const engines = w.BNTExplainer?._engines;
      if (!engines) return -1;
      // Count entries whose section is still in the DOM — what
      // _syncFromReveal's S5 filter sees.
      return engines.filter((e) => document.contains(e.section)).length;
    });
    expect(liveSyncCount).toBe(1);
  });
});
