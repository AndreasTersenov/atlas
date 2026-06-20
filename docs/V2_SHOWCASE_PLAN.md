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

## D. What gets retired (in dependency-aware order, in its own PR after MVP validates)

> Original ordering had subtle dependencies (review §1.8): deleting `proxy.ts` before `/cockpit/*` exposes those routes; `lib/atlas-mapping.ts` is referenced by the bridge but not by v2's `/p/[haloId]` route (which reads halos directly from `data/halos.json`). Re-ordered + grouped:

**Phase 1 — sever the cockpit surface (single commit):**

1. Delete `/cockpit` and `/cockpit/[haloId]` routes.
2. Delete `/sign-in`, `/auth/callback`, `/auth/sign-out`.
3. Delete `/api/integrations/github/*`.
4. Delete `proxy.ts` (safe only after 1–3 — proxy was the auth gate for routes now gone).

**Phase 2 — drop the data plane (separate commit, after Phase 1 deploys clean):**

5. Delete `lib/supabase-server.ts`, `lib/supabase-browser.ts`, `lib/supabase-admin.ts`, `lib/github.ts`, `lib/atlas-mapping.ts`, `lib/atlas-transcript.ts`. (Confirmed `data/halos.json` is the v2 source of truth — no v2 surface imports the `atlas-*` libs.)
6. Delete `scripts/atlas-bridge.ts`, `scripts/seed.ts`.
7. Delete `supabase/` directory.
8. Drop dependencies: `@supabase/ssr`, `@supabase/supabase-js`, `dotenv`, `ws`, `chokidar`, `picomatch`, `@types/ws`, `@types/picomatch`.

**Phase 3 — external state (manual, parallel to Phase 2):**

9. Vercel env vars: remove the four we set.
10. Bridges: `launchctl bootout gui/$UID/com.atlas.bridge` on macbook; kill the tmux bridge window on titan.
11. Supabase `claude_sessions` / `session_messages` tables — optional; they don't cost anything to leave.

**Not retired:** `data/halos.json`, `data/filaments.json`, `components/CosmicWebMap/*`, `app/page.tsx` (public map), the visual identity work. v0 was always right.

**Archive:** before Phase 1 lands, push commit `8f1c988` (v1.5 merge) to a `legacy/v1.x` branch so the cockpit + bridge code stays browsable on GitHub as a learning artifact.

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

### `<RevealExplainer>` component (revised after staff-engineer review)

> Original draft treated this as a Reveal-event stub. The review (see `V2_PLAN_REVIEW.md` §1.1, §3) checked the actual `bnt_explainer.js` source: the explainer reads `.bnt-frag.visible` DOM state to compute the current act (`_syncFromReveal`, lines 1108–1117). The class is set by Reveal itself. Synthesising events alone leaves `shown = 0` forever and the cloud never advances past act 1. The wrapper must emulate **fragment-state DOM**, not just events. Same pattern in `neural_summaries.js` and `sbi_pipeline.js`, so the design amortises.

```tsx
<RevealExplainer
  module="bnt_explainer"      // → /explainers/bnt_explainer.{js,css}
  attach="BNTExplainer"
  kind="cloud"                // bnt_explainer has 3 engines: cloud | mechanism | twopoint
  acts={5}
  beats={5}                   // number of prose <Beat>s driving acts; usually equals acts
/>
```

What it does:

1. On mount: dynamically `<link>` the CSS and `<script>` the JS from `${basePath}/explainers/<module>.{css,js}`. **Both URLs must be prefixed with `process.env.NEXT_PUBLIC_BASE_PATH`** (or the equivalent runtime accessor) — see review §1.5 + §4.4. Bare `/explainers/...` silently 404s under the GH Pages target.
2. Renders the explainer's own section DOM scaffolding: `<section data-bnt-explainer data-bnt-kind={kind}>` containing the Canvas mount point AND `acts-1` invisible `<span class="fragment bnt-frag" data-bnt-act="N">` markers. Without these spans, `_syncFromReveal` has nothing to count.
3. Stubs `window.Reveal` with `on(event, handler)`, `emit(event)`, `isReady()`, `on('ready', …)`, `getCurrentSlide()` returning the wrapper's section element.
4. Calls `window[attach].attach(stubReveal)` once the JS loads. Then fires `'ready'`.
5. On scroll: an IntersectionObserver tracks `<Beat n={N}>` blocks in the prose column. When beat N becomes the active one, the wrapper calls `setActiveAct(N)`:
   ```ts
   function setActiveAct(section: HTMLElement, actIdx: number) {
     const frags = section.querySelectorAll<HTMLElement>('.bnt-frag');
     frags.forEach((f, i) => f.classList.toggle('visible', i < actIdx - 1));
     stubReveal.emit('fragmentshown');  // direction-agnostic; explainer re-polls
   }
   ```
   This is the load-bearing line — it's what makes the explainer's DOM-polling code see the right state.
6. Renders a sticky-positioned `<aside>` for the canvas. Layout per the scrollytelling sketch below.
7. **Load failure path**: if the JS 404s or `window[attach]` is undefined after a timeout, render `<aside role="status">Explainer unavailable — <Link to talk slides></aside>`; surface `console.error` in dev. (Review §2.1.)
8. **Accessibility floor** (review §2.2): aria-live region mirrors the current act's caption text from the engine (`ACT_COPY[act].cap`). On `prefers-reduced-motion: reduce`, the explainer's smoothing constant is overridden to 1 (snap, no tween). Prev/next act buttons rendered under the canvas as a keyboard-and-touch fallback to scrolling.

The wrapper is therefore not "thin." It's the actual product surface — call it ~2–2.5d, not the original 1d.

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

> Per review §1.7 + §5: ship the **stack-proof PR (G.0)** *before* the MVP starts depending on the test stack. AGENTS.md §2 ("Tests are not optional") requires it. Per §4.2: `params` in Next 16 is async (`params: Promise<{ haloId: string }>`) — different from the v1 cockpit page. Per §4.3: rename `next.config.ts → next.config.mjs` for ESM-only remark plugins (or accept the import workarounds in `.ts`).

### G.0 Stack-proof PR (~0.5d, ships first)

1. `npm i -D @playwright/test`, `npx playwright install chromium`.
2. `playwright.config.ts` building locally, base URL on the static-export server (`npx serve out/` or `next start` per the chosen mode).
3. One test: load `/`, assert canvas element width > 100, screenshot, fail on console errors.
4. `.github/workflows/test.yml` running that test on PRs to `v2.0-showcase`.
5. `package.json` script: `"test:e2e": "playwright test"`.

If this PR can't land green, the AGENTS.md regime is fiction. **Acceptance: that one test runs green in CI on the PR.**

### G.1 MVP (the bnt-cnn page)

1. Copy `bnt_explainer.{js,css}` from `talks/NonGaussian_Universe_2026/` into `public/explainers/`. Prepend a `// SOURCE: github.com/AndreasTersenov/talks@<sha>:NonGaussian_Universe_2026/bnt_explainer.js` header. Wire `scripts/sync-explainer.ts` so re-syncs are one command + a git diff (review §1.2.2).
2. Build `app/p/[haloId]/page.tsx` — static, `generateStaticParams()` globs `content/halos/*.mdx`, `params` awaited (Next 16). Reads MDX via `@next/mdx` + `remark-frontmatter` + `remark-mdx-frontmatter` (string-import form so Turbopack accepts them per review §4.3). `mdx-components.tsx` rewrites raw `<img src="/figures/...">` to basePath-aware URLs (review §1.5).
3. Build `components/RevealExplainer/` per the revised §E spec — DOM-state emulator, basePath-prefixed asset URLs, load-failure fallback, aria-live caption mirror, reduced-motion handling, prev/next buttons.
4. Write `content/halos/bnt-cnn.mdx` — frontmatter + ~600 words of prose split across `<Beat>` blocks aligned with the chosen explainer engine. **MVP is `kind="cloud"` only** (review §1.2.1 — the talk uses all three but the format proof only needs one). Mechanism + twopoint follow in Tier-2 enrichments.
5. Wire `CosmicWebMap` halo click → `/p/<id>` (currently `console.log` on the public-page branch — becomes `/p/<id>`).
6. Local preview, screenshot, polish. Deploy to **both** Vercel preview AND a GH Pages preview (review §1.4 — the basePath / Jekyll / trailingSlash gotchas only surface on the GH Pages target).

### G.2 Acceptance criteria (Playwright-assertable, replacing the old "feels right" criterion)

Per review §2.4, "Andreas reads it on his phone and likes it" gets met or unmet on mood. Replace with:

1. Map → halo click navigates to `/p/bnt-cnn`. Zero console errors on both Vercel and GH Pages targets.
2. The cloud canvas paints — Playwright `toHaveScreenshot` against a baseline, with a pixel-tolerance allowance.
3. Scrolling through Beat 1 → Beat 5 advances the explainer through all 5 acts. Assertable via the rendered `.bnt-caption` text containing "1/5" through "5/5".
4. With `prefers-reduced-motion: reduce`, the same 5 acts are reachable via keyboard (Tab to prev/next buttons, Enter to advance).
5. Lighthouse mobile performance ≥ 80 on the deployed Vercel preview.
6. Direct-linking `/p/bnt-cnn/` on GH Pages target renders (`trailingSlash: true` honoured).
7. Andreas's qualitative read on phone is the final go/no-go — but only after 1–6 are green. The mood test gates polish, not function.

## H. Personal-site integration (decided 2026-06-20: both)

Andreas wants Atlas reachable two ways: standalone at `atlas-rust-one.vercel.app`, *and* embedded as a subpath of `andreastersenov.github.io` (Jekyll + Chirpy). Both must work from the same codebase.

Implementation:

- **`output: 'export'` in `next.config.ts`.** Atlas builds to a static `out/` directory — no server runtime needed. (Atlas v2 has no backend, so this is free.) Constraint this imposes: no Next.js features that require a runtime (server actions, route handlers, dynamic image optimization). v2 needs none of them; if a future feature does, the GitHub Pages target needs revisiting.
- **basePath via env var.** `next.config.ts` reads `process.env.ATLAS_BASE_PATH` (default empty). Two builds:
  - **Vercel (`atlas-rust-one.vercel.app`):** no basePath, normal SSG export.
  - **GitHub Pages (`andreastersenov.github.io/atlas/`):** `ATLAS_BASE_PATH=/atlas`, build, push `out/` to a subdir of his GH-Pages repo.
- **All asset/route references go through Next's `<Link>`, `<Image>`, and `next/router`.** Bare `<a href="/...">` or `<img src="/...">` would break under basePath rewrites. **But** (review §1.5 + §4.4): three classes of bare URLs escape this discipline and silently 404 only on the GH Pages target:
  - **MDX raw `<img>`**: `@next/mdx` does not pipe these through `next/image`. Fix in `mdx-components.tsx` by mapping `img` to a wrapper that prepends `process.env.NEXT_PUBLIC_BASE_PATH`.
  - **`<RevealExplainer>` dynamic `<script>` / `<link>` injection**: bypasses Next entirely. Wrapper must read `NEXT_PUBLIC_BASE_PATH` and prepend before injecting.
  - **`next/image` default loader**: doesn't work under `output: 'export'` (review §4.1). Set `images: { unoptimized: true }` in `next.config.mjs` — for a portfolio with ~50 static figures, the lost `srcset` is a worthwhile trade.
- **GitHub Actions workflow** in this repo: on push to `main`, build with `ATLAS_BASE_PATH=/atlas` + `trailingSlash: true`, sync `out/` to the personal-site repo:
  - **`.nojekyll` written into `out/`** so GitHub Pages doesn't strip `_next/static/*` (Jekyll's underscore-prefix convention would otherwise eat the JS bundles).
  - **`trailingSlash: true`** in `next.config.mjs` — `/atlas/p/bnt-cnn` 404s on GH Pages otherwise; with the flag, the export emits `out/p/bnt-cnn/index.html` and direct links resolve.
  - **Cross-repo push auth**: fine-grained PAT in this repo's Actions secrets is the simplest path; `peaceiris/actions-gh-pages` cross-repo deploys need a deploy key, not the default token. Pick one and track expiry. Vercel deploys remain auto on push.
- **Build provenance footer** (review §2.6): every page renders `<footer>build: ${SHA} · target: ${vercel|gh-pages}</footer>`. ~5 LOC; saves diagnostic time when the two artifacts diverge.
- **Routing parity check.** `next/router` and `<Link>` auto-apply basePath. The Canvas-driven map calls `router.push()` directly — also respects basePath. Verified in the PR via the §G.2 acceptance criterion #1 (zero console errors on both targets).

The "both targets" decision is the only one that meaningfully constrains v2 architecture. Everything else in §E stays as written.

## I. Open questions (after staff-engineer review pass)

Three categories: (a) settled by review, (b) needing Andreas's call, (c) deferred-with-default. Plus content-authority spec, accessibility floor, homepage chrome — all flagged by review §2 and folded into §E/§G above.

**Resolved by review:**

- **MDX provider** → `@next/mdx` with `remark-frontmatter` + `remark-mdx-frontmatter` (string-import per review §4.3 so Turbopack accepts them). Files in `content/halos/`.
- **Halo glow on the public map** (was: "default to drop") → **keep it**, source from `git log --since=30d` at build time per review §1.6. ~30 LOC, reuses the v1.5 glow renderer almost verbatim. Without it the map is fully static and the homepage reads as colored dots that don't do anything until you mouse over them.
- **Content authority spec** (review §2.7): `data/halos.json` is canonical for *map presence* (position, radius, glyph, domain, status). MDX frontmatter is canonical for *page metadata* (title, tagline, link list, explainer config, related_halos). Build-time check: every MDX `halo_id` must exist in `halos.json`; halos in `halos.json` without an MDX file fall through to a 404 (not a stub page) until they're written. Loud failure on drift.
- **Acceptance criteria** (review §2.4): the subjective "Andreas likes it" gate is now the Tier-1 polish gate, not the function gate. The function gate is §G.2 1–6.
- **Homepage chrome** (review §2.3): the `/` page gets a one-line site title + tagline + a single "Start with the BNT story →" CTA. Without it a cold visitor sees colored dots with no affordance.

**Needs Andreas's call (no good default):**

- **One vs three explainer engines on the bnt-cnn page** (review §1.2). `bnt_explainer.js` ships three engines (`cloud`, `mechanism`, `twopoint`). The talk uses all three as a sequence. MVP could be **cloud only** (cheapest, validates the format; the talk's real punchline takes the mechanism + twopoint payoffs) or **all three with separate Beat groups per kind** (~+1d of wrapper work, but the bnt-cnn page reads like the talk's story). Default: cloud-only for the MVP, add mechanism + twopoint as a follow-up enrichment if the format lands. **Confirm or override.**

**Deferred with default:**

- **Mobile scrollytelling on Canvas viz** (review §1.3): the cloud canvas is laid out for a square-ish aspect; on mobile (`< lg`), render as the explainer's existing `eng.autoplay()` sequence pinned at the top of a single prose column instead. Stickiness off on mobile.
- **`/about` page** → punt to personal site. Atlas is "the work," personal site is "the person." Add a "by Andreas Tersenov ↗" link in the footer pointing at `andreastersenov.github.io`.
- **Thesis page**: a ~1000-word essay umbrella, ships after `bnt-cnn` validates the format. No interactive explainer; the page binds the rest together.
- **OG cards** (review §2.5): static export supports `generateMetadata` for per-halo `<title>`/`<meta description>`. Per-halo OG images are build-time only and can wait. Ship a single site-wide OG image for the MVP.

## J. Effort estimate (revised after review §6)

| Slice | Original | Revised |
|---|---|---|
| **G.0 Stack-proof PR** (Playwright install + one e2e test + CI workflow) | — | **0.5d** (new) |
| `next.config.ts → next.config.mjs` for ESM remark plugins | — | **0.25d** (new) |
| `mdx-components.tsx` with basePath-aware `img` mapper | — | **0.25d** (new) |
| `/p/[haloId]` route + MDX wiring (Next 16 async `params`, `generateStaticParams`, frontmatter plugins) | 0.5d | **0.75d** |
| `<RevealExplainer>` (fragment-state emulator, basePath asset URLs, load-failure fallback, aria-live, reduced-motion, prev/next buttons) | 1d | **2–2.5d** — review §1.1 made this the actual product, not a thin wrapper |
| `bnt-cnn` MDX prose + explainer port + figure assets + `sync-explainer.ts` | 1d | **1.25d** |
| Wire `CosmicWebMap` click → `/p/[id]` | 0.5d | **0.5d** (cleanup of v1 surfaces breaks out into §D, see below) |
| Local preview + Vercel preview + GH Pages preview | 0.5d | **0.75d** — adding the GH Pages target is where review §1.4 / §1.5 / §4.5 gotchas surface |
| Tier-2 + Tier-3 infill across remaining halos | 2–3 weeks | unchanged (content, not engineering) |
| Retire v1 (separate PR, after MVP validates) | 0.5d | **0.75d** — review §1.8 retirement ordering takes a follow-up |

**MVP (Tier-1 `bnt-cnn` end-to-end): ~5.5–6 code-days of engineering + however long the prose takes.** The original 3.5d under-counted the wrapper and missed the new G.0 stack-proof PR, the config migration, the basePath asset plumbing, and the second deploy target.

## K. Working agreement for v2 (see `AGENTS.md`)

Andreas added explicit autonomous-development guardrails to `AGENTS.md` on 2026-06-20. v2 is the first project to operate under them. They apply to *every* substantive change on this branch:

1. **Draft → adversarial review.** Author the work as Claude A, then spawn a fresh agent briefed as a senior staff engineer doing PR review. Fold real findings in.
2. **Tests are not optional.** vitest for units/integration, `@playwright/test` for UI. Write them alongside; iterate to green.
3. **Evidence over assertion.** Every "done" claim ships with a command + output, a screenshot, a curl response, or a query result — never just "should work."
4. **Audit prior claims** with a tool call before building on them.
5. **One open question, one direct recommendation.**

The first instance of (1) is the staff-engineer review of *this plan*, attached as `docs/V2_PLAN_REVIEW.md` before sign-off.

## L. Status

**Plan written 2026-06-20. Updated 2026-06-20 with (a) decided "both targets" personal-site integration, (b) pointer to the new `AGENTS.md` working agreement. Now going through the first adversarial review per §K.1; appending findings before Andreas signs off.**
