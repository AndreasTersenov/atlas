// /p/[haloId] tests — see docs/V2_SHOWCASE_PLAN.md §G.1.b.
//
// Three oracles, mirroring the G.1.a/G.0 pattern (real, falsifiable, no
// "feels right" criteria):
//
//   - /p/bnt-cnn/ returns 200 and the frontmatter title renders in <h1>.
//   - /p/bnt-cnn/ shows the rendered MDX body text (proves the dynamic
//     import + remark pipeline survived static export).
//   - /p/unknown-halo/ resolves to the not-found page (`dynamicParams = false`
//     means unknown ids 404 at build time, not runtime).

import { expect, test } from "@playwright/test";
import { p } from "./url";

test("halo page renders the MDX content", async ({ page }, testInfo) => {
  // Catch any console errors that fire during hydration; same filter as
  // tests/e2e/homepage.spec.ts.
  const ignoredPatterns: RegExp[] = [
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

  // trailingSlash:true emits /p/bnt-cnn/ as the canonical URL. Hitting the
  // trailing-slash form keeps GH Pages parity (no redirect cost).
  const response = await page.goto(p("/p/bnt-cnn/"), { waitUntil: "load" });
  expect(response?.status()).toBe(200);

  // The frontmatter title appears as the page <h1>.
  const heading = page.getByRole("heading", {
    name: "BNT × CNN: a basis-robust summary",
    level: 1,
  });
  await expect(heading).toBeVisible();

  // The MDX body rendered (proves the dynamic import + remark pipeline
  // survived static export — the "ℓ¹ norm" phrasing is in the placeholder
  // bnt-cnn.mdx and will not move until the explainer lands).
  await expect(
    page.getByText(/wavelet ℓ¹ norm is a powerful non-Gaussian summary/i)
  ).toBeVisible();

  // Frontmatter links rendered as <a> elements with the configured labels.
  await expect(
    page.getByRole("link", { name: /cnn_sbi \(code\)/i })
  ).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("halo-page-bnt-cnn.png"),
    fullPage: true,
  });

  expect(
    consoleErrors,
    `Console errors during halo page load:\n${consoleErrors.join("\n")}`
  ).toHaveLength(0);
});

test("unknown halo id resolves to the not-found page", async ({ page }) => {
  // Under output:'export' + dynamicParams:false, /p/no-such-halo/ has no
  // generated route. The host's 404 handler takes over.
  const response = await page.goto(p("/p/no-such-halo/"), {
    waitUntil: "load",
  });

  // Status 404 is the universal contract — checked on both targets.
  expect(response?.status()).toBe(404);

  // The Next-styled "This page could not be found." body is host-specific.
  // - Vercel target: `serve out/` finds out/404.html (root of the served
  //   tree) and streams it as the body.
  // - GH Pages target / our `.test-mount` equivalent: 404.html lives at
  //   .test-mount/atlas/404.html, not at the served root, so `serve` falls
  //   through to a generic plain-text 404 body. In production this is also
  //   GH Pages's call (whatever 404.html sits at andreastersenov.github.io's
  //   repo root), not Atlas's. So the heading check only runs on Vercel.
  if (process.env.ATLAS_TEST_TARGET !== "ghpages") {
    await expect(
      page.getByRole("heading", { name: /this page could not be found/i })
    ).toBeVisible();
  }
});
