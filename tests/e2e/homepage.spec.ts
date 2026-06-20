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
import halosData from "../../data/halos.json";

interface HaloRecord {
  id: string;
  position_x: number;
  position_y: number;
  radius: number;
}

// Canvas viewBox is 730x640 (CosmicWebMap/colors.ts). Halos are positioned in
// view coordinates; the hit-test in CosmicWebMap/index.tsx:118 scales them by
// canvas.getBoundingClientRect(). We mirror that scaling here so the test
// click lands within the halo's radius regardless of viewport size.
const VIEW_W = 730;
const VIEW_H = 640;

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

test("clicking the bnt-cnn halo navigates to /p/bnt-cnn/", async ({ page }) => {
  // G.1.d: clickability is gated on listMdxHaloIds() at build time, so
  // only halos with a content/halos/<id>.mdx file route on click. bnt-cnn
  // is the one MDX page that exists; clicking its glyph should land on
  // /p/bnt-cnn/. Mirrors the renderer's view-to-client coordinate
  // scaling (CosmicWebMap/index.tsx:118): we read the canvas's actual
  // bounding rect and map the halo's view-space position into pixel
  // coords inside it.
  await page.goto(p("/"), { waitUntil: "load" });

  const canvas = page.getByRole("img", {
    name: /Atlas — a personal cosmic web of projects/i,
  });
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const bnt = (halosData as HaloRecord[]).find((h) => h.id === "bnt-cnn");
  expect(bnt, "data/halos.json missing bnt-cnn record").toBeDefined();

  // Pixel-space click target. We click the halo's CENTER (dist 0 < r), so
  // this is robust to small scaling differences across CI viewports.
  const rect = await canvas.boundingBox();
  expect(rect, "canvas has no bounding box").not.toBeNull();
  const clickX = rect!.x + (bnt!.position_x / VIEW_W) * rect!.width;
  const clickY = rect!.y + (bnt!.position_y / VIEW_H) * rect!.height;

  await page.mouse.click(clickX, clickY);

  // Next router pushes the path; under static export the route is
  // pre-rendered and visiting it loads /p/bnt-cnn/. waitForURL is
  // basePath-aware as long as we use the path-only matcher.
  await page.waitForURL(/\/p\/bnt-cnn\/?(\?|#|$)/, { timeout: 5_000 });
  await expect(
    page.getByRole("heading", {
      name: "BNT × CNN: a basis-robust summary",
      level: 1,
    })
  ).toBeVisible();
});

test("clicking a halo without a /p/ page is a no-op", async ({ page }) => {
  // G.1.d: the homepage passes clickableHaloIds=listMdxHaloIds(), so any
  // halo that doesn't have content/halos/<id>.mdx is rendered but inert
  // — clicks should not navigate. Today bnt-cnn is the only MDX file;
  // any other public halo is safe to use as the negative-case target.
  await page.goto(p("/"), { waitUntil: "load" });

  const canvas = page.getByRole("img", {
    name: /Atlas — a personal cosmic web of projects/i,
  });
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // Pick a public halo that is NOT bnt-cnn; using "thesis" — it has a
  // position and a visible glyph but no MDX file (G.1.b only wrote
  // bnt-cnn.mdx).
  const target = (halosData as HaloRecord[]).find((h) => h.id === "thesis");
  expect(target, "data/halos.json missing thesis record").toBeDefined();

  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const clickX = rect!.x + (target!.position_x / VIEW_W) * rect!.width;
  const clickY = rect!.y + (target!.position_y / VIEW_H) * rect!.height;

  const beforeUrl = page.url();
  await page.mouse.click(clickX, clickY);

  // Wait briefly to give any unintended router.push a chance to fire.
  // 250ms is well beyond Next's same-task scheduling — if a navigation
  // were going to happen, the URL would change within this window.
  await page.waitForTimeout(250);
  expect(page.url()).toBe(beforeUrl);
});
