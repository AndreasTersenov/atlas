# V2 plan — pre-implementation review

**Reviewer:** staff-engineer pass, per AGENTS.md §1 (draft → adversarial review).
**Target:** `docs/V2_SHOWCASE_PLAN.md` (2026-06-20 draft).
**Stance:** not here to bless. Where I'm wrong, the evidence cited below is checkable.

Verdict tags I use: **[must-fix]** (blocks sign-off as drafted), **[should-fix]** (sign off but address before code lands), **[nit]**, **[fine]**.

---

## 1. Hard challenges to specific plan sections

### 1.1 §E `<RevealExplainer>` — the Reveal stub is materially wrong **[must-fix]**

The plan says, in §E:

> Stubs `window.Reveal` with the minimal API the explainers use (per `bnt_explainer.js`: it only calls `Reveal.on('fragmentshown'|'fragmenthidden'|'slidechanged', …)` and reads `Reveal.getCurrentSlide()`).

I read `bnt_explainer.js`. The Reveal surface area is *not* what the plan summarises. The actual contract is more invasive in one direction (it reads DOM state set by Reveal, not just events) and less so in another (`slidechanged` is a no-op for a single page):

- Lines 1054–1090: `attach(Reveal)` calls `Reveal.isReady() / Reveal.on('ready', …)`, then registers `fragmentshown`, `fragmenthidden`, `slidechanged`. So far, in plan.
- Line 1101: `_currentEngine` calls `Reveal.getCurrentSlide()` and matches it against the explainer's own `data-bnt-explainer` section node — used by the `R`-key replay. Stubbable.
- **Lines 1109–1117 (the gotcha):**

  ```js
  _syncFromReveal: function (Reveal) {
    this._engines.forEach(function (e) {
      var frags = e.section.querySelectorAll(".bnt-frag");
      var shown = 0;
      for (var i = 0; i < frags.length; i++) {
        if (frags[i].classList.contains("visible")) shown += 1;
      }
      e.engine.goTo(1 + shown);
    });
  }
  ```

  The current act is computed by **counting `.bnt-frag` DOM elements that carry the Reveal-applied `.visible` class**. Reveal owns that class. In `index.html` lines 582–585 the fragments are bare `<span class="fragment bnt-frag" data-bnt-act="N">…</span>`. Reveal toggles `.visible` on them during fragment transitions. If you fire `fragmentshown` at the stub Reveal but no element ever gets the `.visible` class, `_syncFromReveal` always reports 0 visible fragments and `goTo(1)` runs forever — the cloud never advances past act 1.

  In other words: **the explainer is not event-driven, it is event-triggered + DOM-state-polling.** The plan's "synthesize `fragmentshown` / `fragmenthidden` events" half of the design solves the easier half of the coupling.

- `BNTExplainer` also confirms three more explainer kinds (`cloud`, `mechanism`, `twopoint`, lines 1050) keyed on `data-bnt-kind`. Same `_syncFromReveal` body. I spot-checked `neural_summaries.js` and `sbi_pipeline.js` — same `Reveal.getCurrentSlide()` + DOM-class sync pattern. The future port halos all share the constraint.

**What this means for §E.** The plan's "stub doesn't try to be a full Reveal" framing is right, but the stub needs to be a **Reveal-fragment emulator**: a tiny adapter that, on each beat-in-view transition, *both* fires the stub event *and* sets `classList.add('visible')` on the right number of the section's `.bnt-frag` siblings. The component would be something like:

```ts
function setActiveFragments(section: HTMLElement, count: number) {
  const frags = section.querySelectorAll<HTMLElement>('.bnt-frag');
  frags.forEach((f, i) => f.classList.toggle('visible', i < count));
  stubReveal.emit('fragmentshown'); // (or fragmenthidden, but the explainer doesn't distinguish)
}
```

Not hard, but qualitatively different work from "wrap the explainer in a React component." The §G effort line item ("`<RevealExplainer>` … 1d") doesn't price this in; see §6.

Independent of the bug: the design embeds the explainer's *own* fragment markers (`<span class="fragment bnt-frag" data-bnt-act="N">`) in the explainer's section. The MDX-driven flow in §E has `<Beat n={N}>` blocks that scroll into view in the prose column. We now have two parallel sources of truth for "what act is active":
1. The scrollytelling Beat-in-view (driven by IntersectionObserver).
2. The `.bnt-frag.visible` count in the pinned viz section.

The wrapper has to **derive 2 from 1** every transition. Specify that explicitly. (See §2.4 below for the related test-oracle gap.)

---

### 1.2 §E "Copy the explainer JS into `public/explainers/` as committed binaries" **[should-fix]**

§E:

> **Explainers (JS + CSS):** copied from `talks/<TalkDir>/` into `public/explainers/` on the Atlas branch. Committed binaries. When Andreas updates the talk version, we re-copy. Simple, no submodules, no NPM publishing.

Two real problems:

1. `bnt_explainer.js` is **1122 lines / ~50 kB of hand-rolled vanilla** with three explainer engines (`cloud`, `mechanism`, `twopoint`) baked into one IIFE that exports a single `window.BNTExplainer`. The plan's frontmatter (§E example):

   ```mdx
   explainer:
     module: bnt_explainer
     attach: BNTExplainer
     acts: 5
   ```

   …implies one halo = one explainer file = one act count. But this *file* contains three different visualisations, and the talk uses all three (`index.html` lines 557, 589, 616 — three `<section data-bnt-explainer>` with different `data-bnt-kind`). The cloud is 5 acts; the mechanism is 5 acts; the twopoint is 5 acts. They are intended as a *sequence* in the talk.

   On the `bnt-cnn` halo page, do you embed all three engines (in three scroll panels) or just the cloud? The MVP scope in §G says "the explainer's 5 acts" — singular. That works for one engine, but the bnt-cnn project page that "matches the talk's full intuition" arguably wants all three. Either:
   - declare the MVP is **cloud-only** (cheapest, but the talk's mechanism + 2-point payoffs are what land the point) and acknowledge it,
   - or design `<RevealExplainer>` to accept a `kind` prop and instantiate one section per kind, with separate Beats per kind.

   The plan's effort estimate assumes the first; the talk's structure suggests the second matters. **Decide.**

2. "When Andreas updates the talk, we re-copy." There is no version stamp in the file (no header comment with a date / commit hash). The plan offers no convention. Concretely propose: a `// SOURCE: github.com/AndreasTersenov/talks@<sha>:NonGaussian_Universe_2026/bnt_explainer.js` header prepended at copy time by a `scripts/sync-explainer.ts`, with `npm run sync:explainers` checking in any drift. Otherwise six months in we won't know whether `public/explainers/bnt_explainer.js` is the talk's current version or a fork.

---

### 1.3 §E sticky/scrollytelling layout assumes a non-Canvas viz **[should-fix]**

§E (scrollytelling layout):

> PINNED VIZ (sticky, 60vh)

The BNT explainer's cloud canvas is sized **1520×1200 attribute pixels** (`index.html` line 564) and the engine's `_setupCanvas` reads `getBoundingClientRect()` at every resize (line 207–215). It uses `Math.min(W, H) * 0.115` as the scene unit (line 277).

At `60vh` on a typical laptop (`vh ≈ 800px → 60vh = 480px`) with a narrow right-side viz column (say 45vw = 600px on a 1280-wide viewport), the canvas is ~480px tall. The talk's slide-format canvas was square-ish; the wavelet shadows and labels were designed at that aspect. They will not render legibly at a short, wide aspect — the deep-mode label and the "rare high-κ peaks" callout (lines 293–333) are positioned with raw `P()` math against scene coords; in a squashed viewport they collide with the cloud and the axes go off-frame.

The talk's `index.html` uses `data-bnt-kind="mechanism"` with a wider stage (`bnt-stage--wide` for twopoint, line 619). Andreas already knows this format-sensitivity exists. The plan should:

- pick a target canvas aspect and viewport breakpoint;
- specify what happens to `<RevealExplainer>` on mobile — a single-column with a viz fixed at the top (60vh) means the prose scrolls *underneath* a small canvas that may render the explainer unreadably tiny. The intersect-driven act-advance also gets weird because the IntersectionObserver fires while the viz is partially scrolled off.

I would not put a Canvas-driven explainer behind sticky scrollytelling on mobile at all. Concrete alternative: on `< lg`, render the explainer as an **autoplay sequence** (the explainer already has `eng.autoplay()` on line 235 / 780) above a single column of prose. The desktop scrollytelling layout becomes the desktop-only treatment.

---

### 1.4 §H GitHub Actions deploy plan is unspecified where the risk lives **[should-fix]**

§H:

> **GitHub Actions workflow** in this repo: on push to `main`, build with `ATLAS_BASE_PATH=/atlas`, sync `out/` to `andreastersenov/andreastersenov.github.io` under `atlas/` (push as a bot commit, or push to a `gh-pages` branch there using `peaceiris/actions-gh-pages@v4`). Vercel deploys remain auto on push.

What's missing:

- **Cross-repo push auth.** "Push as a bot commit" needs either a fine-grained PAT stored as an Actions secret on this repo (manual setup, expiry to track) or a GitHub App. Pick one; the alternative is the deploy silently breaks the first time a token expires. Note that `peaceiris/actions-gh-pages` *does not* support cross-repo deploys out of the box without a deploy key.
- **Jekyll vs raw HTML conflict.** Andreas's personal site is Jekyll + Chirpy. Jekyll will, by default, try to process anything pushed under the source root unless excluded — including the Next-emitted `_next/` directory (whose leading underscore Jekyll treats specially). The plan should mandate **either** (a) a `.nojekyll` file in `out/` (one line; cheap), **or** (b) deploying the Atlas output to a sibling `gh-pages` branch on the personal-site repo, not into `main`. Without one of these, the GH Pages build pipeline drops `_next/static/*` and the site loads chrome-only.
- **Path consistency on `andreastersenov.github.io/atlas/` for `output: 'export'`.** With `trailingSlash: false` (the default), `/atlas/p/bnt-cnn` resolves to `out/p/bnt-cnn.html` — Next's `<Link>` and `router.push` will write `/atlas/p/bnt-cnn` (no trailing slash), but GitHub Pages serves *directories* by default. Either set `trailingSlash: true` so the export emits `out/p/bnt-cnn/index.html`, or live with the 404-on-direct-link behaviour. Plan should pick.

---

### 1.5 §H "All asset/route references go through Next's `<Link>` … Lint-enforceable" **[should-fix]**

The line *we'll check in code review* is hopeful. The eslint rule that catches this (`@next/next/no-html-link-for-pages`) does not flag every offender. Specifically:

- The current `CosmicWebMap` renders a `<canvas>` and calls `router.push()` for navigation. **That respects basePath** — confirmed by Next 16's `basePath.md` docs (lines 22–24), which say `next/link` and `next/router` auto-apply basePath. So the existing map is fine.
- The MVP's MDX bodies will end up containing raw `![alt](/figures/bnt-cnn/foo.png)`. **`@next/mdx` does not run those through `next/image`.** They become `<img src="/figures/...">`, which **does not** pick up the basePath. The plan's §H says "lint-enforceable" but offers no specific lint rule that catches this. Concretely: configure the MDX provider's `img` mapper in `mdx-components.tsx` to either rewrite via `process.env.NEXT_PUBLIC_BASE_PATH` or use `<Image>`. This is the kind of thing that silently works on the Vercel build and 404s only under the GH Pages build — exactly the silent-failure mode that costs hours.
- Similarly: the `<RevealExplainer>` dynamically injects `<link href="/explainers/bnt_explainer.css">` and `<script src="/explainers/bnt_explainer.js">`. **Those bypass Next entirely.** The component must prepend `process.env.NEXT_PUBLIC_BASE_PATH` (or read it from a Next-exposed constant) to the URL. The plan doesn't note this. It's the same class of bug as the image one but harder to detect — the missing JS just means the canvas stays blank.

---

### 1.6 §I.3 "drop the halo glow" gives up a load-bearing feature for free **[nit / decision-only]**

§I.3 default is "drop for v2.0; revisit if the map feels static." Worth a beat of thought: the cosmic web is already a *static* artifact in v2 (positions baked, no live data). The only thing that ever animated it was session recency. If the map is the homepage of the showcase, completely static means people land and… look at colored dots, then click. A `git log` derived "recently touched" glow (build-time, no backend) costs ~30 LOC and re-uses the v1.5 glow renderer almost verbatim. I'd default the other way: **keep the glow, source it from `git log --since=30d` at build time**, drop only if it adds build complexity beyond a single script.

---

### 1.7 §K AGENTS.md guardrails encode a test stack the repo can't run **[must-fix as written]**

§K bullet 2:

> **Tests are not optional.** vitest for units/integration, `@playwright/test` for UI. Write them alongside; iterate to green.

Neither `vitest` nor `@playwright/test` appears in `package.json`. The MVP's §J effort estimate budgets nothing for installing, configuring, and writing the first tests. The first PR under the AGENTS.md regime will either (a) skip tests and violate the guardrail in §K, or (b) be a 2-day infrastructure PR before any v2 code lands. See §5 for a concrete proposal; the must-fix here is **acknowledging this in the plan** rather than discovering it on day one.

---

### 1.8 §D retirement order risks deleting code we still need for §G **[should-fix]**

§D lists 11 retirement steps "in order, after MVP validates." Step 5 is `lib/atlas-mapping.ts` — that file is the source of truth for halo metadata that the map and (per §G step 5) the new `/p/[haloId]` route will read. Are we sure §G's MVP doesn't depend on it? Either it's a needed library (then it stays, item 5 wrong), or v2 reads halos straight from `data/halos.json` (then say so explicitly, and call out that any per-halo metadata living only in `atlas-mapping.ts` migrates to `content/halos/*.mdx` frontmatter first).

The same applies to `proxy.ts` at item 4: deleting it means `/cockpit/*` becomes publicly reachable until §D.1 lands, *or* §D.1 lands first and item 4 becomes a no-op. The plan implies the items are independent; some aren't. Re-order or note the dependency.

---

## 2. Things the plan doesn't address but should

### 2.1 Failure mode when an explainer fails to load **[should-fix]**

The `<RevealExplainer>` dynamically `<script>`-loads from `/explainers/<module>.js`. If the request 404s (typo in frontmatter, cache miss after a re-deploy, basePath misconfigured per §1.5), the page renders the prose column fine but the right-hand pinned area is blank. There is no fallback message, no Sentry, no nothing — Andreas browses on his phone, sees a half-page, doesn't know whether it's a load error or "still scrolling to the viz." Spec: on load failure, render `<aside role="status">Explainer unavailable — <link to talk slides></aside>` and surface it in dev with `console.error`.

### 2.2 Accessibility for a Canvas-driven, scroll-triggered viz **[should-fix]**

A pinned `<canvas>` whose state changes when prose scrolls into view is *less* accessible than a `fragmentshown`-driven Reveal slide — at least there a keyboard user advances explicitly. With scrollytelling:

- a screen-reader user is stuck with the canvas's `aria-label` (currently "A fixed point cloud of map pixels with rotating measuring axes…" per `index.html` line 565) — fine as a static description but does *not* update with the act state;
- a keyboard-only user has no way to advance acts without scrolling pixel-precise through the prose;
- `prefers-reduced-motion` is unimplemented and the explainer has a 0.12-smooth tween (line 250) that runs on every act change.

For a *public scientific portfolio* targeting industry hiring committees and academic audiences, this matters. Minimum bar: aria-live region echoing the current act's caption (the engine already produces `ACT_COPY[act].cap` as HTML), `prefers-reduced-motion → set SMOOTH = 1` (snap), and explicit "← prev act / next act →" buttons under the viz. None of these are large; missing all of them looks careless.

### 2.3 What the homepage actually shows is unclear **[should-fix]**

§E:

> `/` Public cosmic-web map (unchanged from v0; halo click → `/p/[haloId]`)

But §I.4 punts `/about` to the personal site, and §F says the public map filters out dormant halos. So a visitor lands on the map and gets… colored dots with hover-only context. There is no title above the map, no "Andreas Tersenov — cosmic web of projects" framing, no "click a halo to read" affordance. On mobile the map auto-fits into a viewport with no chrome. The plan should explicitly include the homepage chrome (one-line site title + a single sentence + maybe a "Read the BNT story →" CTA pinned to the tier-1 halo for cold visitors).

### 2.4 Acceptance criteria are subjective **[must-fix]**

§G success criterion:

> Andreas reads the bnt-cnn page on his phone and goes "yes, this is what I want to show."

This is the kind of test that gets met or unmet on mood. Replace with a concrete checklist:

- map → halo click navigates to `/p/bnt-cnn` (no console errors, both Vercel and GH Pages targets);
- the cloud canvas paints (non-blank pixels in a Playwright screenshot, not just "page rendered");
- scrolling from Beat 1 to Beat 5 advances the explainer through all 5 acts (assertable: the rendered `.bnt-caption` text contains "1/5" → "5/5", or the engine's `act` field updates);
- on `prefers-reduced-motion: reduce`, the same 5 acts are reachable via keyboard;
- lighthouse mobile performance ≥ 80 (vanilla-JS explainer is heavy but cacheable).

This is the kind of acceptance set §K bullet 3 ("Evidence over assertion") *requires*.

### 2.5 SEO/OG cards for sharing **[nit-but-easy]**

This is a public showcase, so the day Andreas posts a halo URL into a Twitter/Slack/LinkedIn DM matters. Plan says nothing about OG images. `next/og` works with static export (per Next 16 docs — `route.md` route handlers GET-only static, so `/api/og.png?halo=bnt-cnn` would *not* work, but a build-time generated `og:image` per halo would). Either ship per-halo OG cards (one image generated at build time per `content/halos/*.mdx`) or fall back to a single site-wide `og:image`. Default to the latter for the MVP, but say so.

### 2.6 The "two builds, one codebase" build artifact provenance **[should-fix]**

If Vercel builds from `main` and GH Actions also builds from `main` with `ATLAS_BASE_PATH=/atlas`, those two artifacts can drift if the build runs at different commits, or if Vercel uses a build cache GH Actions doesn't have. There is no version stamp planned (`<meta name="atlas-build" content="<sha>">`). When a halo page misbehaves on andreastersenov.github.io and works on atlas-rust-one.vercel.app (or vice versa), what do you check? A footer "build: <short-sha>, target: <vercel|gh-pages>" is ~5 LOC and saves diagnostic time.

### 2.7 Content authority for the schema **[should-fix]**

§E shows MDX frontmatter mirroring `data/halos.json` (`status`, `domain`). What's the source of truth? If frontmatter and JSON disagree, who wins? Concrete spec: `data/halos.json` is canonical for *map presence* (position, radius, glyph); MDX frontmatter is canonical for *page metadata* (title, tagline, links, explainer). At build time, fail loud if an MDX frontmatter halo_id doesn't exist in halos.json. Otherwise an editorial drift becomes a silent rendering bug.

---

## 3. BNT explainer file evidence (the §E coupling claim)

**Claim under test (§E):** the explainer is reveal-agnostic — `BNTExplainer.attach(Reveal)` is the only coupling.

**Verdict: false as stated; partially salvageable.**

Evidence from `/tmp/bnt_explainer.js` (downloaded via `gh api repos/AndreasTersenov/talks/contents/NonGaussian_Universe_2026/bnt_explainer.js`):

1. The explainer registers Reveal event handlers (lines 1075–1082):
   ```js
   Reveal.on("fragmentshown",  function () { self._syncFromReveal(Reveal); });
   Reveal.on("fragmenthidden", function () { self._syncFromReveal(Reveal); });
   Reveal.on("slidechanged",   function () { … });
   ```
   These could be synthesised by a stub. ✓

2. The explainer calls `Reveal.getCurrentSlide()` (line 1101) inside `_currentEngine` — used only by the `R`-key replay shortcut. Stubbable as `() => sectionEl`. ✓

3. **The explainer reads `.bnt-frag.visible` DOM state to compute the act** (lines 1108–1117):
   ```js
   // Current act = 1 + number of visible bnt fragments on the active slide.
   _syncFromReveal: function (Reveal) {
     this._engines.forEach(function (e) {
       var frags = e.section.querySelectorAll(".bnt-frag");
       var shown = 0;
       for (var i = 0; i < frags.length; i++) {
         if (frags[i].classList.contains("visible")) shown += 1;
       }
       e.engine.goTo(1 + shown);
     });
   }
   ```
   The `.visible` class is **applied by Reveal itself** as fragments advance. Without Reveal, no element ever gets `.visible` set, and `shown` stays 0 forever. Confirmed by `index.html` lines 582–585, which show the fragment markup as inert spans (no inline `class="visible"` and no `aria-hidden="false"`):
   ```html
   <span class="fragment bnt-frag" data-bnt-act="2" aria-hidden="true"></span>
   ```

4. The same `_syncFromReveal` pattern appears in `neural_summaries.js` (line 257–290) and `sbi_pipeline.js` (lines 153–172) — same coupling, same fix needed. The cost of getting the stub right amortises across the three explainers Andreas plans to port.

**What the plan needs to change.** The `<RevealExplainer>`'s job is *not* "synthesize Reveal events." It is "**simulate Reveal's fragment-visibility DOM state**, then fire the corresponding events." Concrete API to add to §E:

```ts
// inside <RevealExplainer> on IntersectionObserver "beat N is in view":
function setActiveAct(section: HTMLElement, actIdx: number) {
  const frags = section.querySelectorAll<HTMLElement>('.bnt-frag');
  // actIdx is 1..N; visible count is actIdx - 1
  frags.forEach((f, i) => f.classList.toggle('visible', i < actIdx - 1));
  stubReveal.emit('fragmentshown'); // direction doesn't matter; the handler re-polls
}
```

…and the `<RevealExplainer>` *must* render the fragment span markup itself (or the host MDX must, but then it's not a black-box wrapper). I'd put it in the wrapper, parameterised by `acts={5}`.

**Impact on §E architecture.** The wrapper's contract becomes: render the section element with the right `data-bnt-explainer` attribute, the right Canvas children with the right class names, *and* the right `.bnt-frag` markers; on mount, also inject the JS+CSS, stub Reveal, call `BNTExplainer.attach(stubReveal)`. That is a larger component than §E sketches.

---

## 4. Next 16 `output: 'export'` + basePath foot-guns

I read `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`, `…/basePath.md`, `…/dynamic-routes.md`, and the index of `…/05-config/01-next-config-js/` (no `output: 'export'`-specific config file — it's documented under the guides + the `output.md` reference, which covers `standalone` only). Findings:

### 4.1 Unsupported features list — the plan's "v2 needs none of them" is true today, with caveats

From `static-exports.md` lines 274–293, **App Router unsupported under `output: 'export'`** is:

- Dynamic Routes with `dynamicParams: true`
- Dynamic Routes without `generateStaticParams()`
- Route Handlers that rely on Request
- Cookies, Rewrites, Redirects, Headers, Proxy
- Incremental Static Regeneration
- `next/image` with the default loader
- Draft Mode, Server Actions, Intercepting Routes

The plan acknowledges this list at a high level. Specific implications for v2 that the plan should call out:

- **`/p/[haloId]` requires `generateStaticParams()` returning all halo IDs**, and `dynamicParams = false`. The plan says "static, reads MDX from `content/halos/<id>.mdx`" — confirm this means a `generateStaticParams` that globs the content dir. Forget the export, and the build fails loud — fine. But: combined with §2.7 (frontmatter vs JSON), the build will also fail if `data/halos.json` has a halo with no MDX file. Decide: do you pre-render *only* halos with MDX (Tier-1 + Tier-2), and 404 the rest, or do you generate a stub page per halo?

- **`next/image` is broken under default loader.** §H mentions this. Plan should commit: either set `images: { unoptimized: true }` (cheapest; loses next/image's responsive `srcset` benefit) or write a custom loader. For a portfolio site with ~50 figures, `unoptimized: true` is fine.

- **`generateMetadata` *is* supported** and is the way to ship per-halo `<title>`, `<meta description>`, and (per §2.5) OG cards. The plan doesn't mention metadata at all. Should.

### 4.2 Next 16 `params` is async

From `dynamic-routes.md` line 22 — `params: Promise<{ slug: string }>`. This is the Next 15→16 breaking change. Trivial to handle (`const { haloId } = await params`) but worth noting since the existing `app/cockpit/[haloId]/page.tsx` uses the old sync shape (server component, no `await`). When the v2 `/p/[haloId]` page lands, the new pattern must be used, and CI / docs should reflect it. **AGENTS.md** preamble ("This is NOT the Next.js you know") is the lone signpost; the plan does not echo it. Add a one-line note in §G step 2.

### 4.3 MDX + Turbopack remark plugin limitation

From `mdx.md` line 758:

> remark and rehype plugins without serializable options cannot be used yet with Turbopack, because JavaScript functions can't be passed to Rust.

The default `next dev` in Next 16 is Turbopack. If the plan ends up wanting (e.g.) `remark-frontmatter` for the YAML block in the MDX (it has to, since `@next/mdx` does not parse frontmatter — `mdx.md` line 622), the plugin has to be specified as a string in `createMDX` options, *and* it has to be one that supports serialisable options. `remark-frontmatter` does. `remark-mdx-frontmatter` does. The plan should call out: frontmatter parsing requires installing these and using the string-import form in `next.config.mjs`.

(Aside: `next.config.ts` exists in this repo, but the @next/mdx docs *strongly* prefer `.mjs` because the remark ecosystem is ESM-only. Decide whether to rename or keep `.ts` and accept the import pain.)

### 4.4 basePath interacts with the `<RevealExplainer>` asset URLs

Already raised in §1.5. The Next 16 `basePath.md` doc confirms `<Link>` and `next/router` auto-prefix, but **bare `<script src>` and `<link rel>` injection do not**. The plan's wrapper must read the basePath at build time. The cleanest Next 16 pattern is to expose it as `NEXT_PUBLIC_BASE_PATH` (an env var the plan already proposes as `ATLAS_BASE_PATH` — same idea, just needs the `NEXT_PUBLIC_` prefix to be readable client-side).

### 4.5 trailingSlash decision is unforced — but force it

For GH Pages, set `trailingSlash: true` and emit `out/p/bnt-cnn/index.html`. Vercel handles either; GH Pages handles `/p/bnt-cnn/` cleanly and 404s `/p/bnt-cnn` (no slash, no extension) unless `.html`-suffix fallback is configured. This is a one-line `next.config.ts` change with material impact on the GH Pages target.

---

## 5. Test stack — the §K choice is aspirational

### Reality check

Per `package.json`, `vitest` and `@playwright/test` are not installed; nothing else even resembling a test framework is. CI runs nothing test-shaped. AGENTS.md §2 requires "Tests are not optional" for *every substantive change*. The plan-as-drafted ships an MVP under this regime with zero infrastructure for the regime.

### Is the choice right?

For *this* project shape — a static-export Next site with two pages of interest (the map and `/p/[haloId]`), heavy on a vanilla-JS Canvas explainer wrapped by a React component — the answer is **Playwright yes, Vitest mostly aspirational**:

- **What Playwright catches that nothing else does:** the explainer renders. The `.bnt-frag` DOM toggling works. Scrolling triggers act advancement. basePath handling under both build targets. Visual regression of the canvas (Playwright `toHaveScreenshot` is good enough for "the cloud is not blank"). These are *exactly* the bugs that would otherwise hit Andreas's phone first.
- **What Vitest would catch:** frontmatter parsing, halo-id-to-MDX resolution, the `setActiveFragments` pure function from §1.1. Useful but small — the v2 codebase will not be unit-test-rich; it's mostly Next plumbing and content.

If forced to one, take Playwright. AGENTS.md should be amended to read "Playwright required; Vitest where it earns its keep."

### Smallest-possible vertical slice that proves the stack

Before §G's `bnt-cnn` MVP starts depending on it, ship this — call it the **stack-proof PR**, 0.5 day:

1. `pnpm add -D @playwright/test`, `npx playwright install chromium`.
2. `playwright.config.ts` that builds with `pnpm build && pnpm exec next start` (or `serve out/`) and points the test base URL at the local server.
3. *One* test: `npx playwright test homepage` — loads `/`, asserts the canvas element exists and has `width > 100`, takes a screenshot, fails if the page errors in console.
4. CI workflow in `.github/workflows/test.yml` that runs that one test on PRs to `v2.0-showcase`.

If this PR can't land green, the AGENTS.md regime is fiction. If it can, every subsequent feature gets a test by extending this one file. That is the gating experiment before §G, not after.

(Add a `pnpm test` and `pnpm test:e2e` script. The `package.json` currently has no test script at all.)

---

## 6. Effort estimate sanity check

§J's MVP line items, against the evidence above:

| §J item | §J estimate | My read |
|---|---|---|
| `/p/[haloId]` route + MDX wiring | 0.5d | **Roughly right** if `generateStaticParams` + `@next/mdx` + `remark-frontmatter` go in cleanly. Add 0.25d for the Next 16 `params: Promise` adjustment and for getting Turbopack + ESM remark plugins working in `next.config.mjs`. |
| `<RevealExplainer>` (Reveal stub, IntersectionObserver, sticky layout) | 1d | **Materially under-counted.** Per §1.1 it isn't a Reveal-event stub; it's a Reveal-fragment-DOM-state emulator that also dynamically loads JS/CSS, propagates basePath into those URLs, handles load failure (§2.1), exposes prev/next buttons (§2.2), and ships an `aria-live` caption mirror. Realistic: **2–2.5d**. |
| `bnt-cnn` MDX prose + explainer port + figure assets | 1d | **About right for the prose+figures**, but missing the explainer-port sync script (§1.2) and the choice between one engine vs three (§1.2.1). Add 0.25d for either decision. |
| Wire `CosmicWebMap` click → `/p/[id]`; clean v1 surfaces | 0.5d | **Plus the retirement-order risk (§1.8)** — the v1 surfaces should be deleted in a separate PR after the v2 MVP lands, not bundled. Estimate is for the wiring; the cleanup is its own 0.5d, not extra-but-bundled. |
| Local preview iteration + Vercel preview deploy | 0.5d | **Add the GH Pages preview deploy.** The plan validates only the Vercel target. The basePath / Jekyll / trailingSlash gotchas in §1.4–1.5 *only* show up on the GH Pages build. Realistic: **0.75d** to also stand up the Actions workflow and watch a real `/atlas/p/bnt-cnn` URL render. |
| Retire v1 | 0.5d | Reasonable, but per §1.8 some items have ordering dependencies. Make it 0.75d to add a follow-up commit untangling those. |

Plus the missing-from-§J items:

- Stack-proof PR (§5): **+0.5d**.
- `next.config.ts → next.config.mjs` (§4.3) or workaround: **+0.25d**.
- `mdx-components.tsx` with `img` rewrite (§1.5): **+0.25d**.

**Bottom-of-§6 number.** §J says 3.5 code-days; I'd budget **5.5–6 code-days** for the MVP under the §K guardrails as written. The Tier-2/Tier-3 timeline (2–3 weeks of content) is unaffected — that's prose work, not engineering.

The biggest single line item to revisit is `<RevealExplainer>`: the plan treats it as a thin wrapper; it is the actual product.

---

## Bottom line

**Verdict: sign off *with* must-fix items addressed.** The shape of v2 is right — public showcase, MDX project pages anchored on the existing cosmic-web map, talk explainers as the interactive payload — and the scope reset away from the cockpit is honest about why v1 didn't land. The plan does not need rework. But three things have to change before code starts: (1) `<RevealExplainer>` is a *Reveal fragment-state emulator*, not a Reveal-event stub, because the explainer reads `.bnt-frag.visible` DOM state to advance acts (§1.1, §3); (2) the basePath story has to extend to dynamically-injected `<script>`/`<link>`/`<img>` URLs, not just `<Link>` (§1.5, §4.4); (3) the §K test-stack guardrail needs the stack-proof PR (§5) shipped *before* the bnt-cnn MVP starts depending on it. The should-fix items (sticky layout on mobile, Jekyll/trailingSlash, accessibility, OG cards, acceptance criteria, retirement ordering) can be folded in as the MVP develops, but each one is a real foot-gun. Realistic MVP budget: 5.5–6 code-days, not 3.5.
