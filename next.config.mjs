// Atlas v2 — Next.js config for the static-export, dual-target deploy.
//
// Two deploy targets share this config:
//   1. Vercel (independent site at atlas-rust-one.vercel.app) — no basePath.
//   2. GitHub Pages, embedded as a subpath of andreastersenov.github.io
//      (e.g. /atlas/) — set NEXT_PUBLIC_ATLAS_BASE_PATH=/atlas at build time.
//
// See docs/V2_SHOWCASE_PLAN.md §H for the full deploy plan and §I for the
// resolved choices that drove these flags.

import createMDX from "@next/mdx";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dirname` exists on Node 20.11+; macbook local dev is on 20.10
// and CI on 20.17, so the explicit shim keeps both working.
const __dirname = dirname(fileURLToPath(import.meta.url));

const basePath = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";

// remark plugins must be specified as STRINGS (not imported callables) so
// Turbopack can serialize them across the JS↔Rust boundary — see Next 16
// `mdx.md` §"Using Plugins with Turbopack" and V2_PLAN_REVIEW.md §4.3.
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      "remark-frontmatter",
      // Parses the YAML block and exports it as `frontmatter` from the
      // compiled MDX module — `import Doc, { frontmatter } from "..."`.
      ["remark-mdx-frontmatter", { name: "frontmatter" }],
    ],
    rehypePlugins: [],
  },
});

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Static export — Atlas v2 has no server runtime, so every page bakes to
  // /out at build time. This forbids route handlers that read Request,
  // dynamic routes without generateStaticParams, server actions, ISR, and
  // the default next/image loader; v2 doesn't use any of them. See Next 16
  // docs/01-app/02-guides/static-exports.md for the full list.
  output: "export",

  // basePath flows from build env so the same source compiles for both
  // targets. The "NEXT_PUBLIC_" prefix on the env var name is what bakes
  // it into the client bundle (Next's DefinePlugin substitutes
  // `process.env.NEXT_PUBLIC_ATLAS_BASE_PATH` at build time wherever it
  // appears in client code) — no `env:` block needed here.
  //
  // <RevealExplainer> reads this at runtime to prefix the dynamically-
  // injected `<script src=…>` and `<link href=…>` URLs that bypass
  // Next's automatic basePath handling.
  basePath: basePath || undefined,

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

  // Default pageExtensions is ["ts","tsx","js","jsx"] which is what we
  // want — MDX files live under content/halos/ and are *imported*, not
  // dropped into app/ as routes. Leaving pageExtensions at the default
  // keeps file-based routing for tsx/jsx pages only.
};

export default withMDX(nextConfig);
