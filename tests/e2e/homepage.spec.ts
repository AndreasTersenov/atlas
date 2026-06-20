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

import { expect, test, type Page, type Locator } from "@playwright/test";
import { p } from "./url";
import halosData from "../../data/halos.json";
import { VIEW_W, VIEW_H } from "../../components/CosmicWebMap/colors";

interface HaloRecord {
  id: string;
  position_x: number;
  position_y: number;
  radius: number;
  is_public?: boolean;
}

// Shared hydration gate for click tests. The map sets canvas.width via its
// ResizeObserver, then React hydrates and wires onClick. Both happen after
// the canvas becomes "visible" — clicking before width > 100 races
// hydration and can produce a no-op click that looks like the production
// non-clickable path. The smoke test (above) documents this; the click
// tests must wait too. See G1d_PR_REVIEW.md §1.1 (S1).
async function waitForCanvasReady(canvas: Locator): Promise<void> {
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => canvas.evaluate((el) => (el as HTMLCanvasElement).width), {
      message:
        "canvas.width never grew past 100 — ResizeObserver / hydration didn't run",
      timeout: 5_000,
    })
    .toBeGreaterThan(100);
}

// Maps a halo's view-space center to pixel coords inside the rendered
// canvas using the same rect-scaling the renderer's hit-test uses.
async function clickPointForHalo(
  page: Page,
  canvas: Locator,
  halo: Pick<HaloRecord, "position_x" | "position_y">
): Promise<{ x: number; y: number }> {
  void page;
  const rect = await canvas.boundingBox();
  expect(rect, "canvas has no bounding box").not.toBeNull();
  return {
    x: rect!.x + (halo.position_x / VIEW_W) * rect!.width,
    y: rect!.y + (halo.position_y / VIEW_H) * rect!.height,
  };
}

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
  // /p/bnt-cnn/.
  await page.goto(p("/"), { waitUntil: "load" });

  const canvas = page.getByRole("img", {
    name: /Atlas — a personal cosmic web of projects/i,
  });
  await waitForCanvasReady(canvas);

  const bnt = (halosData as HaloRecord[]).find((h) => h.id === "bnt-cnn");
  expect(bnt, "data/halos.json missing bnt-cnn record").toBeDefined();

  // Pixel-space click target — halo center (dist 0 < r), robust to small
  // scaling differences across CI viewports.
  const { x, y } = await clickPointForHalo(page, canvas, bnt!);
  await page.mouse.click(x, y);

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
  // — clicks should not navigate. We use "thesis": no MDX file (G.1.b
  // only wrote bnt-cnn.mdx) but a public glyph that's still visible.
  await page.goto(p("/"), { waitUntil: "load" });

  const canvas = page.getByRole("img", {
    name: /Atlas — a personal cosmic web of projects/i,
  });
  await waitForCanvasReady(canvas);

  const target = (halosData as HaloRecord[]).find((h) => h.id === "thesis");
  expect(target, "data/halos.json missing thesis record").toBeDefined();
  // Make the test's assumption about thesis explicit — if a future
  // halos.json edit drops it from the public layer, the click would land
  // on empty canvas and the URL-unchanged assertion would pass for the
  // wrong reason. See G1d_PR_REVIEW.md §2.2 (N3).
  expect(
    target!.is_public,
    "thesis must be public for this test to exercise the inert-click path"
  ).toBe(true);

  const { x, y } = await clickPointForHalo(page, canvas, target!);
  const beforeUrl = page.url();
  await page.mouse.click(x, y);

  // Wait briefly to give any unintended router.push a chance to fire.
  // 250ms is well beyond Next's same-task scheduling — if a navigation
  // were going to happen, the URL would change within this window.
  await page.waitForTimeout(250);
  expect(page.url()).toBe(beforeUrl);
});
