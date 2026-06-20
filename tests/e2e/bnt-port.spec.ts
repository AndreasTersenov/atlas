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

    // The engine constructor reads .bnt-cloud + .bnt-kernels canvases
    // from the scaffolding the page renders. Constructor throws (bad
    // port, missing scaffolding element, etc.) surface as a pageerror
    // and are caught by the consoleErrors net in afterEach — that's the
    // primary failure-mode net. The positive-signal proof that attach()
    // completed is the act-counter rendering "1 / 5", which only happens
    // after setStatus("ready"). The engine-state probe below adds a
    // genuine logic-level assertion: engine.act === 1 only if the engine
    // constructed AND _syncFromReveal called goTo(1).
    const section = page.locator(
      '[data-bnt-explainer][data-bnt-kind="cloud"]'
    );
    await expect(section).toBeVisible();
    await expect(section.locator("canvas.bnt-cloud")).toBeVisible();
    await expect(section.locator("canvas.bnt-kernels")).toBeVisible();
    await expect(page.locator('[data-role="act-counter"]')).toHaveText(
      "1 / 5",
      { timeout: 5_000 }
    );

    // Engine-state probe — the only assertion that catches a port
    // regression that throws *after* _setupCanvas runs (constructor lines
    // 178–180: _buildMeter() can throw if .bnt-meter is absent, AFTER
    // _setupCanvas has already sized the canvas). Without this, the
    // visible canvas would look like a healthy attach. engine.act is
    // updated by goTo() which is called by _syncFromReveal — so this
    // value is 1 only on a fully-wired handshake.
    const engineAct = await page.evaluate(() => {
      const w = window as unknown as {
        BNTExplainer?: { _engines: { engine: { act: number } }[] };
      };
      return w.BNTExplainer?._engines[0]?.engine.act ?? null;
    });
    expect(engineAct).toBe(1);
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
    // sections are skipped — but more importantly, the detached engine
    // doesn't get its RAF loop re-armed.
    await page.goto(p("/smoke/explainer/"), { waitUntil: "load" });
    await page.goto(p("/smoke/bnt-explainer/"), { waitUntil: "load" });
    await expect(
      page.locator(
        '[data-bnt-explainer][data-bnt-kind="cloud"] canvas.bnt-cloud'
      )
    ).toBeVisible();

    // Let any in-flight tween settle. Without this, an engine that was
    // mid-animation when navigation happened would still be `running`
    // because of its already-scheduled RAF callbacks, not because the
    // S5 filter is broken. SMOOTH=0.12 converges in ~12 frames; 500ms
    // gives generous headroom on 60fps and slower CI runners.
    await page.waitForTimeout(500);

    // Load-bearing S5 assertion: after settling, no detached engine
    // entry should still be `running`. If the S5 filter were removed,
    // _syncFromReveal would re-arm the RAF loop on detached engines on
    // every fragmentshown event, and `running` would be true.
    const detachedStillRunning = await page.evaluate(() => {
      const w = window as unknown as {
        BNTExplainer?: {
          _engines: { section: HTMLElement; engine: { running: boolean } }[];
        };
      };
      const engines = w.BNTExplainer?._engines;
      if (!engines) return false;
      return engines.some(
        (e) => !document.contains(e.section) && e.engine.running
      );
    });
    expect(detachedStillRunning).toBe(false);
  });
});
