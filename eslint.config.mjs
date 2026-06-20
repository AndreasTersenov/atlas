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
  ]),
]);

export default eslintConfig;
