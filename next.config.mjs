// Atlas v2 — Next.js config for the static-export, dual-target deploy.
//
// Two deploy targets share this config:
//   1. Vercel (independent site at atlas-rust-one.vercel.app) — no basePath.
//   2. GitHub Pages, embedded as a subpath of andreastersenov.github.io
//      (e.g. /atlas/) — set NEXT_PUBLIC_ATLAS_BASE_PATH=/atlas at build time.
//
// See docs/V2_SHOWCASE_PLAN.md §H for the full deploy plan and §I for the
// resolved choices that drove these flags.

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dirname` exists on Node 20.11+; macbook local dev is on 20.10
// and CI on 20.17, so the explicit shim keeps both working.
const __dirname = dirname(fileURLToPath(import.meta.url));

const basePath = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Static export — Atlas v2 has no server runtime, so every page bakes to
  // /out at build time. This forbids route handlers that read Request,
  // dynamic routes without generateStaticParams, server actions, ISR, and
  // the default next/image loader; v2 doesn't use any of them. See Next 16
  // docs/01-app/02-guides/static-exports.md for the full list.
  output: "export",

  // basePath flows from build env so the same source compiles for both
  // targets. NEXT_PUBLIC_ so client code (e.g. <RevealExplainer>'s
  // dynamically-injected <script src=…> URLs) can also read it; without
  // that prefix the value would not be inlined into the client bundle.
  // The "/" prefix is intentional — Next.js requires basePath to start
  // with a slash (or be falsy/empty).
  basePath: basePath || undefined,

  // The route name itself is exposed for any client code that needs to
  // build a basePath-aware URL — e.g. CSS `<link href="/explainers/foo.css">`
  // injected by <RevealExplainer> can't rely on Next's auto-prefix.
  env: {
    NEXT_PUBLIC_ATLAS_BASE_PATH: basePath,
  },

  // Force directory-style URLs (/p/bnt-cnn/ → out/p/bnt-cnn/index.html) so
  // GitHub Pages serves direct-links correctly. Without this, /p/bnt-cnn
  // (no slash) 404s on GH Pages because Pages does not auto-resolve
  // extensionless URLs to .html.
  trailingSlash: true,

  // next/image's default loader needs a runtime; under output:'export' it
  // can't run. Atlas has ~50 static figures in public/figures/; the lost
  // srcset is an acceptable trade for a portfolio.
  images: { unoptimized: true },

  // Pin the workspace root to silence the multi-lockfile warning (carried
  // over from v1).
  turbopack: { root: __dirname },
};

export default nextConfig;
