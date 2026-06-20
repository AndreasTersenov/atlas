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
  await page.goto("/p/bnt-cnn/", { waitUntil: "load" });

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
  // generated route. `serve` returns the static 404 page Next emits.
  const response = await page.goto("/p/no-such-halo/", {
    waitUntil: "load",
  });

  // serve returns 404 for unmatched paths and falls back to 404.html;
  // confirm both signals.
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /this page could not be found/i })
  ).toBeVisible();
});
