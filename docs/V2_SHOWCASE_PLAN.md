# Atlas v2.0 — public showcase

**Status:** draft, awaiting Andreas's sign-off (2026-06-20).
**Supersedes:** the cockpit / observatory direction in `docs/V1_PLAN.md`, `docs/V1_5_PLAN.md`, `docs/HANDOFF.md`. v1 ships as merged on `main` (commit `8f1c988`); v2 is a deliberate scope reset, not an extension.

## A. Why this exists

Atlas v1 evolved from "agent dispatch surface" → "cross-machine Claude observatory" → polished + verified end-to-end. It works. It's also not used. The original differentiator (agent dispatch) never had a concrete use case; the observatory pivot solved a problem Andreas doesn't actually have day-to-day. Meanwhile Andreas is defending in ~3 months, moving to a UVa postdoc, planning the frontier-AI transition behind that. A public artifact that says *look at the shape of my work, not its chronology* compounds career capital in a way a private tracker doesn't.

v2 drops the cockpit direction entirely. **Atlas becomes a public showcase only:** the cosmic-web map as the homepage of his work, with each halo opening into a curated per-project page anchored on interactive scientific explainers he's already built for his Reveal.js talks.

## B. What v2 is — and isn't

**Is:**
- One artifact, public, no auth, static export.
- The existing cosmic-web map (no changes — already great).
- `/p/[haloId]` per-halo project pages: MDX content + linked artifacts + an embedded interactive explainer where one exists.
- Interactive explainers ported from his `talks` repo (`bnt_explainer.js`, `neural_summaries.js`, `sbi_pipeline.js`, `tomography`).
- Scroll-driven act transitions (per Andreas's call 2026-06-20).
- A tiered content plan (§F) so a 23-halo showcase ships in defense-window-realistic time.

**Isn't:**
- A private project tracker. Andreas already has tmux, git, CHANGELOG.md, his notes system. Adding another would be tooling-as-procrastination.
- A site that requires a backend. No Supabase, no auth, no Realtime, no bridge, no integrations, no API routes.
- A new repo. We build on the existing Atlas codebase (continuity, the v0 map + chrome stay).

## C. Repo + branching strategy

| What | Where |
|---|---|
| v2.0 work | branch `v2.0-showcase` (this branch). PRs land here, squash-merge into `main` when v2.0 ships. |
| v1 cockpit + bridge | archived to branch `legacy/v1.x` (cut from main commit `8f1c988`) before deletion lands on main. Learning artifact value preserved; not deleted from history. |
| `main` after ship | clean v2 showcase only, no cockpit code. |

The v1 PR (#6) is already merged. There's nothing to "un-merge"; v2 progressively replaces v1 surfaces.

## D. What gets retired (in order, after MVP validates)

1. `/cockpit` and `/cockpit/[haloId]` routes — replaced by `/p/[haloId]`.
2. `/sign-in`, `/auth/callback`, `/auth/sign-out` — no auth.
3. `/api/integrations/github/*` — no integrations.
4. `proxy.ts` — nothing to guard.
5. `lib/supabase-*`, `lib/github.ts`, `lib/atlas-mapping.ts`, `lib/atlas-transcript.ts`.
6. `scripts/atlas-bridge.ts`, `scripts/seed.ts`.
7. `supabase/` directory.
8. Dependencies: `@supabase/ssr`, `@supabase/supabase-js`, `dotenv`, `ws`, `chokidar`, `picomatch`, `@types/ws`, `@types/picomatch`.
9. Vercel env vars: the four we just set.
10. The local + remote bridges (Andreas: `launchctl bootout gui/$UID/com.atlas.bridge` on macbook, kill tmux on titan).
11. The `claude_sessions` / `session_messages` tables in Supabase (optional — they don't cost anything).

**Not retired:** `data/halos.json`, `data/filaments.json`, `components/CosmicWebMap/*`, the public map at `/`, the visual identity work. v0 was always right.

## E. Architecture

### Routes

| Route | What |
|---|---|
| `/` | Public cosmic-web map (unchanged from v0; halo click → `/p/[haloId]`) |
| `/p/[haloId]` | Per-halo project page (new) |
| `/about` | Optional bio page (deferred — could live on personal site instead) |

`/cockpit/*` routes removed (item D.1).

### Halo content schema

`content/halos/<halo-id>.mdx`. Frontmatter + MDX body:

```mdx
---
halo_id: bnt-cnn
title: "BNT × CNN: a basis-robust summary"
tagline: "Why the wavelet ℓ1-norm collapses under BNT while the CNN doesn't."
status: active                 # mirrors data/halos.json
domain: research               # mirrors data/halos.json
links:
  - { kind: github,  href: "https://github.com/AndreasTersenov/cnn_sbi", label: "cnn_sbi" }
  - { kind: paper,   href: "https://arxiv.org/abs/...",                  label: "Tersenov+ 2026" }
  - { kind: slides,  href: "https://andreastersenov.github.io/talks/NonGaussian_Universe_2026/", label: "Talk slides" }
explainer:
  module: bnt_explainer        # → public/explainers/bnt_explainer.{js,css}
  attach: BNTExplainer         # window.<attach>.attach() entry
  acts: 5                      # number of scroll-anchored beats
related_halos: [thesis, wavelet-l1-norm, mass-map-uncertainty]
---

<Beat n={1}>
  Prose for act 1 — the scene set, what the reader sees in the viz.
</Beat>

<Beat n={2}>
  Prose for act 2 — the "wait, that's surprising" moment.
</Beat>

…
```

The MDX body is rendered as prose flowing alongside a pinned `<RevealExplainer>` whose act state is driven by which `<Beat>` is currently in view.

### `<RevealExplainer>` component

```tsx
<RevealExplainer
  module="bnt_explainer"      // → /explainers/bnt_explainer.{js,css}
  attach="BNTExplainer"
  acts={5}
  scrollContainer="parent"    // or a ref
/>
```

What it does:

1. On mount: dynamically `<link>` the CSS and `<script>` the JS from `/explainers/<module>.{css,js}`.
2. Stubs `window.Reveal` with the minimal API the explainers use (per `bnt_explainer.js`: it only calls `Reveal.on('fragmentshown'|'fragmenthidden'|'slidechanged', …)` and reads `Reveal.getCurrentSlide()`).
3. Calls `window[attach].attach(stubReveal)` once the JS loads.
4. On scroll: synthesizes `fragmentshown` / `fragmenthidden` events based on which `<Beat>` is in view (IntersectionObserver, with a `rootMargin` that puts the trigger ~halfway down the viewport).
5. Renders a sticky-positioned div the explainer's Canvas lives in; the surrounding MDX prose scrolls past it.

The stub doesn't try to be a full Reveal. It implements just enough that an explainer written for Reveal acts as if scroll position = current fragment.

### Scrollytelling layout

```
┌──────────────────────────────────────────┐
│  HEADER: title, tagline, link pills      │
├────────────────────┬─────────────────────┤
│                    │                     │
│  PINNED VIZ        │  SCROLLING PROSE    │
│  (sticky, 60vh)    │  <Beat n={1}>       │
│                    │   …                 │
│                    │  <Beat n={2}>       │
│                    │   …                 │
│                    │  <Beat n={3}>       │
│                    │   …                 │
│                    │                     │
└────────────────────┴─────────────────────┘
│  OUTRO: artifacts, related halos, refs   │
└──────────────────────────────────────────┘
```

Two-column on desktop (`lg:` and up), single-column with viz pinned at top on mobile. Sticky viz means the viz stays visible while prose scrolls; an IntersectionObserver on `<Beat>` elements drives act transitions.

### Asset pipeline (figures + explainers)

Two sources, two pipelines:

- **Explainers (JS + CSS):** copied from `talks/<TalkDir>/` into `public/explainers/` on the Atlas branch. Committed binaries. When Andreas updates the talk version, we re-copy. Simple, no submodules, no NPM publishing.
- **Static figures (PNG/SVG):** in `public/figures/<halo-id>/`. Either copied from `talks/assets/figures/` or generated fresh from research repos. MDX references via `![alt](/figures/bnt-cnn/foo.png)`.

We do **not** try to keep the talks repo and Atlas in lockstep. Talk explainers are a snapshot at the time of port; Andreas updates Atlas when the explainer evolves enough to be worth porting.

## F. Tier plan (manages defense-window scope)

Three tiers. Tier-1 ships the format; Tier-2 makes the showcase feel complete; Tier-3 keeps the map honest without ballooning effort.

### Tier 1 — full treatment (~5 halos, ~1 week each)

| Halo | Existing asset | Repo |
|---|---|---|
| `bnt-cnn` | `bnt_explainer.js` (5+6 acts ready) | `cnn_sbi` |
| `thesis` | umbrella narrative (no explainer; written prose + key figures from across the work) | `PhD_thesis` (private — describe, don't link) |
| `mass-map-uncertainty` | `neural_summaries.js`? (TBD) | `HierarchicalShearDemo`? |
| `wavelet-l1-norm` | `bnt_explainer mechanism` variant fits this halo's angle | `l1_theory_validation` |
| `postdoc-uva` | no explainer — context page (place, people, research direction) | n/a |

### Tier 2 — solid baseline (~10 halos, ~1–2 days each)

`euclid-howls`, `bnt-cnn` siblings (`dl-mass-mapping`, `wavelet-benchmarks`, `l1-emulator`), `opt-transport`, `thesis-defense`, `cca-ny-trip`, `astrostat`, infrastructure halos (`personal-site`, `claude-infrastructure`, `claude-arxiv`), `3mt`.

Each: 1–2 strong static figures (lift from talks `assets/figures/`), ~250 words of prose, real artifact links. No interactive explainer.

### Tier 3 — minimal (the rest, ~1 hour each)

`personal-private` (already the padlock — page says "Private — content TBD"). `anthropic-fellowship` stays dormant (not rendered on public). Other small halos: one paragraph + one image/link.

**Defense-window plan:** ship Tier-1 `bnt-cnn` as the MVP; if the format lands, Tier-2 + Tier-3 are mechanical infill, ~2–3 weeks. If the format doesn't land, regroup before scaling.

## G. The `bnt-cnn` MVP (first concrete shippable)

1. Copy `bnt_explainer.{js,css}` from `talks/NonGaussian_Universe_2026/` into `public/explainers/`.
2. Build `app/p/[haloId]/page.tsx` — static, reads MDX from `content/halos/<id>.mdx`, renders header + two-column scrollytelling layout + outro.
3. Build `components/RevealExplainer/` — JS+CSS loader, Reveal stub, IntersectionObserver act-driver.
4. Write `content/halos/bnt-cnn.mdx` — frontmatter + ~600 words of prose split across `<Beat>` blocks aligned with the explainer's 5 acts.
5. Wire `CosmicWebMap` halo click → `/p/<id>` (currently `console.log` on public, `/cockpit/<id>` on the cockpit branch — both become `/p/<id>`).
6. Local preview, screenshot, polish. Deploy to Vercel preview before merging.

Success criterion: Andreas reads the bnt-cnn page on his phone and goes "yes, this is what I want to show."

## H. Personal-site integration (deferred decision)

Andreas has `andreastersenov.github.io` (Jekyll + Chirpy on GitHub Pages, updated 2026-06-19). Three integration shapes worth considering — **not deciding now**, but flagging so we don't paint ourselves into a corner:

1. **Keep separate.** Atlas at `atlas-rust-one.vercel.app`, personal site links to it from the landing page. Simplest, zero migration.
2. **Embed via iframe.** A page on the personal site iframes Atlas. Works but tends to look stitched-together.
3. **Migrate Atlas to GitHub Pages.** Static export from Next.js, host alongside the Jekyll site at e.g. `andreastersenov.github.io/work/`. Cleanest URL story; one codebase to maintain in two render targets is a friction surface.

For v2.0 we ship to `atlas-rust-one.vercel.app` (zero change) and decide the integration later. The static-export friendliness in v2.0 keeps option 3 open.

## I. Open questions

These don't block sign-off. Flagging in case Andreas has opinions before I start coding.

1. **MDX provider choice.** `@next/mdx` (official, simplest) vs `next-mdx-remote` (more flexible — content in DB-able format). Default: `@next/mdx`, files in `content/halos/`. The "files in repo" pattern matches your thesis workflow.
2. **Beat → act mapping in scrollytelling.** Per-Beat IntersectionObserver vs single scroll-position calculation. IntersectionObserver is simpler and accessible; scroll-position can do smoother in-between states. Default: IntersectionObserver for v2.0; refine if it feels too discrete.
3. **Halo glow on public map.** v1.5 wired session-recency glow; we're killing sessions. Drop the glow entirely, or repurpose to something else (e.g. "recent commit" derived statically at build time from git log)? Default: drop for v2.0; revisit if the map feels static.
4. **`/about` page.** Live on Atlas, or punt to the personal site? Default: punt to personal site; Atlas is "the work," personal site is "the person."
5. **Thesis page.** No existing explainer. Best treatment is probably a written essay (~1000 words) with embedded figures pulled from your talks/papers, framing how the other halos hang off the central thesis question. Not in the MVP; comes after `bnt-cnn` validates the format.

## J. Effort estimate

| Slice | Effort |
|---|---|
| `/p/[haloId]` route + MDX wiring | 0.5d |
| `<RevealExplainer>` (Reveal stub, IntersectionObserver, sticky layout) | 1d |
| `bnt-cnn` MDX prose + explainer port + figure assets | 1d (probably more on the prose side — that's content, not code) |
| Wire `CosmicWebMap` click → `/p/[id]`; clean v1 surfaces (proxy, sign-in, etc.) on the v2 branch | 0.5d |
| Local preview iteration + Vercel preview deploy | 0.5d |
| Tier-2 + Tier-3 infill across remaining 18 halos | 2–3 weeks (mostly content; you, not me) |
| Retire v1 (delete code, archive branch, drop deps, drop Vercel env vars, kill bridges) | 0.5d |

**MVP (Tier-1 `bnt-cnn` end-to-end): ~3.5d of code + however long the prose takes.** That's the gating experiment.

## K. Status

**Plan written 2026-06-20. Awaiting Andreas's sign-off before scaffolding any code.**
