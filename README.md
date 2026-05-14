# Atlas

A personal operating system that takes the visual form of a cosmic web. Each project in Andreas Tersenov's life is a luminous halo on the web; filaments connect halos that share methodology, dependencies, or career arcs.

![Atlas v0 — the public cosmic web map](docs/screenshots/v0.png)

This repo ships **v0**: the public-facing map. No backend, no auth, no agents — just the rendered cosmic web. v1 layers on auth, integrations, and agent dispatch (see [`docs/ATLAS_HANDOFF.md`](docs/ATLAS_HANDOFF.md)).

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind v4
- **Rendering**: HTML5 Canvas, hand-rolled — no map library
  - Static layers pre-baked to an offscreen canvas; hover repaints just blit and overlay
  - Sprite-based matter clumps (one gradient sprite per intensity, scaled+rotated per clump)
  - All 18 glyphs traced vertex-by-vertex from `references/atlas_cosmic_web_v8.svg`
- **Data**: `data/halos.json` + `data/filaments.json` — single edits add halos / connections
- **Deploy**: Vercel, fully static (page is prerendered at build time, `○ (Static)`)

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000 (or whichever port is free).

The map fills the viewport. Hover a halo to brighten it; click a halo to log its id to the console (routing arrives in v1).

## Build + deploy

```bash
npm run build       # produces .next/ — fully static
npx vercel          # preview deploy
npx vercel --prod   # production
```

## Project layout

```
app/
  page.tsx                public map (filters halos to is_public || locked)
  layout.tsx              metadata + dark body
  globals.css
components/CosmicWebMap/
  index.tsx               client component: canvas, ResizeObserver, hit-test, hover/click
  renderer.ts             z-ordered draw layers + offscreen-cache management
  glyphs.ts               18 glyph drawing functions, parameterised by halo.r
  colors.ts               palette constants (nebulas, matter gradients, halo per-domain)
  types.ts
data/
  halos.json              19 halos (17 public + 2 private — 1 rendered as locked)
  filaments.json          career-arc, knowledge, dependency, infrastructure, faint cross-cluster
docs/
  ATLAS_HANDOFF.md        full design document — read this for context
  screenshots/v0.png
references/
  atlas_cosmic_web_v8.svg the visual reference v0 was built against
```

## Design context

The `docs/ATLAS_HANDOFF.md` file is the source of truth for what Atlas is, why each tech choice was made, the data model, the integration matrix, and the phased build plan from v0 through v3. **Read it before extending the map** — many decisions there are settled and shouldn't be relitigated.
