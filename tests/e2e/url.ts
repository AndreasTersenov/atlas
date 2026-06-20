// Tiny URL helper for the dual-target test matrix.
//
// When ATLAS_TEST_TARGET=ghpages, NEXT_PUBLIC_ATLAS_BASE_PATH is also set
// (Playwright's webServer prepends it to `npm run build`), and the test
// server stages out/ under .test-mount/atlas/. Tests written as
// `page.goto(p("/"))` resolve to the right URL on both targets:
//
//   vercel  → http://localhost:3000/
//   ghpages → http://localhost:3000/atlas/
//
// Same trick for /p/bnt-cnn/, /p/no-such-halo/, etc.

const BASE_PATH = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";

export function p(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`url.p expects an absolute path, got "${path}"`);
  }
  // basePath is "" or "/atlas" — concat is safe in either case.
  return `${BASE_PATH}${path}`;
}
