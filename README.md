# Atlas

A personal cosmic-web map of Andreas Tersenov's projects. Each project is a luminous halo; filaments connect halos that share methodology, dependencies, or career arcs. Hover for the project's name and links. Click any halo with a written page to read the long-form story behind it — currently the **BNT × CNN** explainer page, with three interactive Canvas explainers ported from Andreas's *Non-Gaussian Universe (2026)* talk.

![Atlas — the public cosmic web map](docs/screenshots/v0.png)

## What this is

A static showcase site:

- **Homepage** (`/`): the cosmic-web map.
- **Halo pages** (`/p/<halo-id>/`): MDX-authored long-form pages for the halos that have written content. Today only **bnt-cnn** has one; more land as Andreas writes them.

There is no auth, no database, no backend. Halos and filaments come from `data/halos.json` + `data/filaments.json` at build time. Page content comes from `content/halos/*.mdx`. Everything is pre-rendered to static HTML and JS, deployable to Vercel or GitHub Pages without a server.

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Output**: static export (`output: "export"`), no server runtime
- **Styling**: Tailwind v4
- **Map rendering**: hand-rolled HTML5 Canvas — no map library
  - Static layers pre-baked to an offscreen canvas; hover repaints just blit and overlay
  - 18 glyphs traced vertex-by-vertex from `references/atlas_cosmic_web_v8.svg`
- **Halo pages**: `@next/mdx` + `remark-frontmatter` + `remark-mdx-frontmatter`
- **Explainers**: Andreas's vanilla-JS Canvas explainers from `talks/NonGaussian_Universe_2026/`, ported to `public/explainers/` and driven by `<RevealExplainer>` — a React wrapper that emulates the Reveal.js fragment-state DOM the explainers expect
- **Tests**: Playwright e2e against the production build (`next build` + `serve out`), matrix on both deploy targets (Vercel + GH-Pages-via-basePath)
- **Deploy**: Vercel (default) or GitHub Pages (set `NEXT_PUBLIC_ATLAS_BASE_PATH=/atlas` at build time)

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The map fills the viewport. Hover a halo to brighten it; click a clickable halo to navigate to its page. Halos without a written page render but don't respond to clicks (the cursor stays `default`).

No environment variables are required for local dev.

## Build + deploy

```bash
npm run build       # produces out/ — fully static export
```

For the Vercel deploy: `npx vercel --prod`, or just push to the configured branch.

For the GitHub Pages deploy: build with `NEXT_PUBLIC_ATLAS_BASE_PATH=/atlas npm run build`, then publish `out/` to the `gh-pages` branch (or wherever Pages serves from).

## Tests

```bash
npm run setup                                            # one-time: download Playwright Chromium
npm run test:e2e                                          # vercel target (default)
ATLAS_TEST_TARGET=ghpages npm run test:e2e                # ghpages target (with basePath)
```

The suite exercises the production runtime: `next build` then `serve out/`. CI runs both matrix legs on every PR — green on both is the contract before merge. See `playwright.config.ts` and `AGENTS.md` §1 for the working agreement.

## Project layout

```
app/
  page.tsx                  homepage — renders the map, gates clickability by listMdxHaloIds()
  layout.tsx                root metadata + dark body
  p/[haloId]/page.tsx       dynamic per-halo route; dynamic-imports content/halos/<id>.mdx
  smoke/                    test-only routes gated on ATLAS_TEST_ROUTES=1 (e2e harnesses)

components/CosmicWebMap/    the cosmic-web canvas + glyphs + hit-test (renderer is hand-rolled)
components/RevealExplainer/ scrollytelling wrapper for the vanilla-JS Canvas explainers
components/BNTExplainer/    section scaffolding components for the bnt_explainer engines

content/halos/
  bnt-cnn.mdx               long-form page for the bnt-cnn halo

data/
  halos.json                authoritative halo list (map presence + position + glyph)
  filaments.json            connections between halos

public/explainers/
  bnt_explainer.{js,css}    ported from talks/NonGaussian_Universe_2026/, plus two
                            tagged Atlas patches (// Atlas v2 patch)
  _smoke.{js,css}           synthetic test fixture for the RevealExplainer e2e tests

docs/
  ATLAS_HANDOFF.md          original v0 design document — historical context
  V2_SHOWCASE_PLAN.md       v2 plan; the "this is what the site is now" document
  G*_PR_REVIEW.md           per-PR staff-engineer review records under AGENTS.md §1

AGENTS.md                   working agreement for autonomous development
```

## Working agreement

`AGENTS.md` codifies the v2 working agreement: draft → adversarial review → tests → evidence-over-assertion. Every substantive PR is reviewed end-to-end by a fresh agent simulating staff PR review; findings are addressed before merge. See `docs/G*_PR_REVIEW.md` for the record.

## Design context

`docs/ATLAS_HANDOFF.md` is the original v0 design document (May 2026) — it predates the v1 cockpit / agent dispatch directions that were retired in v2. Read it for the cosmological framing and visual decisions. `docs/V2_SHOWCASE_PLAN.md` is the current document — read it for what the site is now and where it's going.
