// RevealExplainer wrapper tests — G.1.c.2.
//
// Drives the wrapper via the `_smoke` synthetic explainer fixture so we
// can verify the fragment-state DOM emulator end-to-end without needing
// the real bnt_explainer.js port (that lands in G.1.c.3). The synthetic
// fixture mirrors the same Reveal coupling shape the real explainers use
// (event-triggered, DOM-state-polling), so passing this suite is the
// load-bearing evidence that the wrapper will drive the real port too.
//
// The smoke route gates on `ATLAS_TEST_ROUTES=1` at build time — set by
// playwright.config.ts so the route is enabled here and disabled in
// production builds (atlas-rust-one.vercel.app, GH Pages).

import { expect, test } from "@playwright/test";
import { p } from "./url";

// Captures console.error AND pageerror; tests can assert the array is
// empty at the end. Same shape as tests/e2e/homepage.spec.ts so the
// invariant is uniform across the suite.
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
];

test.describe("RevealExplainer wrapper", () => {
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
    // Tests that intentionally trigger errors (e.g. the script-404
    // fallback) reset this array themselves before exit.
    expect(
      consoleErrors,
      `Console errors during test:\n${consoleErrors.join("\n")}`
    ).toHaveLength(0);
  });

  test("loads the explainer JS+CSS with basePath, initial state is act 1", async ({
    page,
  }) => {
    await page.goto(p("/smoke/explainer/"), { waitUntil: "load" });

    // The script and stylesheet must be present in the head with the
    // basePath-correct URLs — this is the bit the G.1.c.1 gate validates
    // matters under /atlas/.
    const scriptSrc = await page
      .locator('script[src*="/explainers/_smoke.js"]')
      .first()
      .getAttribute("src");
    const linkHref = await page
      .locator('link[href*="/explainers/_smoke.css"]')
      .first()
      .getAttribute("href");

    const expectedBasePath = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";
    expect(scriptSrc).toBe(`${expectedBasePath}/explainers/_smoke.js`);
    expect(linkHref).toBe(`${expectedBasePath}/explainers/_smoke.css`);

    // SmokeExplainer.attach() ran → section gained data-current-act="1".
    const section = page.locator('[data-bnt-explainer][data-bnt-kind="smoke"]');
    await expect(section).toHaveAttribute("data-current-act", "1", {
      timeout: 5_000,
    });
    await expect(section.locator('[data-role="smoke-act"]')).toHaveText("1");

    // The act counter mirrors the same state.
    await expect(page.locator('[data-role="act-counter"]')).toHaveText("1 / 5");
  });

  test("scrolling through beats advances the explainer through all acts", async ({
    page,
  }) => {
    await page.goto(p("/smoke/explainer/"), { waitUntil: "load" });
    const section = page.locator('[data-bnt-explainer][data-bnt-kind="smoke"]');
    await expect(section).toHaveAttribute("data-current-act", "1");

    for (let n = 2; n <= 5; n++) {
      // Scroll the matching beat into view; the IntersectionObserver
      // promotes it to the active beat, the wrapper updates act state,
      // toggles fragment markers, the fixture's poller observes and
      // updates the section's data-current-act.
      await page.locator(`[data-beat-n="${n}"]`).scrollIntoViewIfNeeded();
      await expect(section).toHaveAttribute("data-current-act", String(n), {
        timeout: 3_000,
      });
      await expect(section.locator('[data-role="smoke-act"]')).toHaveText(
        String(n)
      );
    }
  });

  test("prev/next buttons advance and clamp at the edges", async ({ page }) => {
    await page.goto(p("/smoke/explainer/"), { waitUntil: "load" });
    const section = page.locator('[data-bnt-explainer][data-bnt-kind="smoke"]');
    const counter = page.locator('[data-role="act-counter"]');
    const prev = page.getByRole("button", { name: "Previous act" });
    const next = page.getByRole("button", { name: "Next act" });

    // At act 1, prev is disabled, next is enabled.
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(counter).toHaveText("1 / 5");

    // Next: act 1 → 2.
    await next.click();
    await expect(counter).toHaveText("2 / 5");
    await expect(section).toHaveAttribute("data-current-act", "2");
    await expect(prev).toBeEnabled();

    // Click next 3 more times to reach act 5.
    await next.click();
    await next.click();
    await next.click();
    await expect(counter).toHaveText("5 / 5");
    await expect(section).toHaveAttribute("data-current-act", "5");
    await expect(next).toBeDisabled();

    // Prev: act 5 → 4.
    await prev.click();
    await expect(counter).toHaveText("4 / 5");
    await expect(section).toHaveAttribute("data-current-act", "4");
    await expect(next).toBeEnabled();
  });

  test("load failure renders the fallback notice", async ({ page }) => {
    // Intercept the script request and return 404. The wrapper's onerror
    // handler should set status=failed and render the role=status notice.
    await page.route(/\/explainers\/_smoke\.js$/, (route) => {
      route.fulfill({ status: 404, contentType: "text/plain", body: "" });
    });

    await page.goto(p("/smoke/explainer/"), { waitUntil: "load" });

    await expect(
      page.locator('[role="status"]', {
        hasText: /interactive viz unavailable/i,
      })
    ).toBeVisible({ timeout: 5_000 });

    // Counter still renders so users have a manual escape hatch.
    await expect(page.locator('[data-role="act-counter"]')).toHaveText("1 / 5");

    // The wrapper's onerror handler logs to console.error by design. Pop
    // that expected line before afterEach asserts on an empty array;
    // anything else in the array is a real failure.
    const expectedLoadFailure = consoleErrors.findIndex((e) =>
      /\[RevealExplainer\] Failed to load .*_smoke\.js/.test(e)
    );
    expect(expectedLoadFailure).toBeGreaterThanOrEqual(0);
    consoleErrors.splice(expectedLoadFailure, 1);
    // Browser also emits a "Failed to load resource" line for the
    // intercepted 404. Drop those too if present.
    consoleErrors = consoleErrors.filter(
      (e) => !/Failed to load resource/i.test(e)
    );
  });
});
