import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // basePath e2e mount dir (created by playwright.config.ts when
    // ATLAS_TEST_TARGET=ghpages; mirrors out/ so eslint shouldn't scan it).
    ".test-mount/**",
    // Playwright run artifacts.
    "test-results/**",
    "playwright-report/**",
    // Third-party explainer JS — ported verbatim from Andreas's talks repo
    // (NonGaussian_Universe_2026), uses vintage ES5 idioms (`var self=this`,
    // function expressions) the project's TS-based rules reject. Keeping the
    // port grep-equivalent to the upstream source is more valuable than
    // rewriting it to satisfy lint. Atlas-specific patches are tagged with
    // "Atlas v2 patch" comments so they survive a re-port from upstream.
    "public/explainers/**",
  ]),
]);

export default eslintConfig;
