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
import { p } from "./url";

test("public homepage renders the cosmic web map", async ({ page }, testInfo) => {
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

  // `load` (not `domcontentloaded`) so React entry chunks have finished
  // fetching and hydration has begun by the time we proceed — otherwise
  // hydration-time console.errors race with the listener attached above
  // and can mask the actual test assertions.
  await page.goto(p("/"), { waitUntil: "load" });

  // The map's canvas carries an aria-label we set in v0 — that's our
  // resilient handle.
  const canvas = page.getByRole("img", {
    name: /Atlas — a personal cosmic web of projects/i,
  });
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // The canvas only gets a non-zero width after CosmicWebMap's ResizeObserver
  // measures the container and sets canvas.width. If this is 0, the React
  // component crashed silently and we just rendered the static HTML. Poll
  // rather than read once — ResizeObserver fires in its own task and races
  // with `toBeVisible()` on slower CI runs.
  await expect
    .poll(
      async () => canvas.evaluate((el) => (el as HTMLCanvasElement).width),
      {
        message:
          "canvas.width never grew past 100 — ResizeObserver / rebuildStatic didn't run",
        timeout: 5_000,
      }
    )
    .toBeGreaterThan(100);

  // rebuildStatic() runs synchronously in the same task as the width-set,
  // so by the time .width > 100 the static layer cache is already filled.
  // No timer-based wait needed before snapping.

  // The width check alone proves the ResizeObserver fired — *not* that
  // anything actually rendered. The drawing chain in renderStatic() lives
  // inside the ResizeObserver callback, which swallows thrown exceptions.
  // If renderStatic throws, repaint() is skipped and the visible canvas
  // stays in its post-`canvas.width=…` reset state (fully transparent).
  // Probe the center pixel: (a) alpha > 0 means the canvas was actually
  // drawn to; (b) it's not the pure background colour means at least the
  // nebula tint or halo layer rendered on top. The center of the 730×640
  // view sits inside the research nebula region around the thesis halo,
  // so a real render leaves a non-trivial colour there.
  const probe = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const { data } = ctx.getImageData(
      Math.floor(c.width / 2),
      Math.floor(c.height / 2),
      1,
      1
    );
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  });
  expect(probe, "could not read canvas pixel data").not.toBeNull();
  expect(
    probe!.a,
    `canvas center pixel is transparent (alpha=${probe!.a}) — renderStatic likely threw inside the ResizeObserver callback, which swallowed the exception`
  ).toBeGreaterThan(0);
  const isPureBackground = probe!.r === 26 && probe!.g === 8 && probe!.b === 40;
  expect(
    isPureBackground,
    `canvas center is the pure background colour #1A0828 (rgb 26,8,40) — nebula tint and halo layers didn't render. Pixel was (${probe!.r}, ${probe!.g}, ${probe!.b}, ${probe!.a}).`
  ).toBe(false);

  // Screenshot as evidence — per-test output path so parallel projects /
  // retries don't overwrite each other's artifacts.
  await page.screenshot({
    path: testInfo.outputPath("homepage.png"),
    fullPage: false,
  });

  // Fail the test if any errors fired during the run. Doing this at the end
  // captures everything, not just the first.
  expect(
    consoleErrors,
    `Console errors during homepage load:\n${consoleErrors.join("\n")}`
  ).toHaveLength(0);
});
