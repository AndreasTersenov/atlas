// Stack-proof test for v2 — see docs/V2_SHOWCASE_PLAN.md §G.0.
//
// What this test proves:
//   - The dev server boots.
//   - The public homepage renders the cosmic-web canvas (real pixels, not
//     just the page HTML — width > 100 after layout, which only happens
//     once the React component runs).
//   - There are no console errors during load.
//   - A screenshot can be captured as evidence.
//
// If this test goes red, every downstream v2 PR has nothing to build on.

import { expect, test } from "@playwright/test";

test("public homepage renders the cosmic web map", async ({ page }) => {
  // Capture console errors as we go — the test fails if any fire before the
  // final assertion. Filter out the well-known noise we accept on /
  // (Grammarly's hydration warning was the v1 case; keep this list short and
  // explicit so real regressions can't slip through).
  const ignoredPatterns: RegExp[] = [
    // Vercel speed-insights + Next dev-only noise we intentionally tolerate.
    /\[Fast Refresh\]/i,
    /Download the React DevTools/i,
  ];
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ignoredPatterns.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The map's canvas carries an aria-label we set in v0 — that's our
  // resilient handle.
  const canvas = page.getByRole("img", {
    name: /Atlas — a personal cosmic web of projects/i,
  });
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // The canvas only gets a non-zero width after CosmicWebMap's ResizeObserver
  // measures the container and sets canvas.width. If this is 0, the React
  // component crashed silently and we just rendered the static HTML.
  const widthAttr = await canvas.evaluate(
    (el) => (el as HTMLCanvasElement).width
  );
  expect(widthAttr).toBeGreaterThan(100);

  // Give one paint cycle for the static layer cache to fill before snapping.
  await page.waitForTimeout(500);

  // Screenshot as evidence — committed to test-results/ on demand, attached
  // to CI artifacts automatically.
  await page.screenshot({
    path: "test-results/homepage.png",
    fullPage: false,
  });

  // Fail the test if any errors fired during the run. Doing this at the end
  // captures everything, not just the first.
  expect(
    consoleErrors,
    `Console errors during homepage load:\n${consoleErrors.join("\n")}`
  ).toHaveLength(0);
});
