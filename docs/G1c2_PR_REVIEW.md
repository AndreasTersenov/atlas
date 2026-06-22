# G.1.c.2 PR Review — `<RevealExplainer>` scrollytelling wrapper

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #11.
**Branch reviewed:** `v2.0-reveal-explainer` at HEAD (post-Copilot pass, commit `d1b18ff`).
**Prior reviews:** `docs/G0_PR_REVIEW.md`, `docs/G1a_PR_REVIEW.md`, `docs/G1b_PR_REVIEW.md`, `docs/G1c1_PR_REVIEW.md` — findings not repeated.
**bnt_explainer.js source:** fetched via WebFetch from `github.com/AndreasTersenov/talks` HEAD, lines 1040–1130.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1.c.3 starts, **[nit]**, **[fine]**.

---

## 1. What's still wrong or fragile after the Copilot pass

### 1.1 `statusRef` useEffect comment misrepresents the timing guarantee [nit — N1]

`components/RevealExplainer/index.tsx` lines 124–129. The comment claims the effect runs "inside React's commit phase" — it doesn't (that's `useLayoutEffect`). The actual fix for `isReady()` ordering is the synchronous `statusRef.current = "ready"` at line 228, before `stub.emit("ready")` at line 229. The `useEffect` is belt-and-suspenders for any future code path that touches `setStatus` without also touching the ref. A wrong timing comment will mislead the next debugger.

### 1.2 Fixture-specific `<span data-role="smoke-act">1</span>` ships in the production component [should-fix — S1]

`components/RevealExplainer/index.tsx` line 409. The span is the smoke fixture's display target — `_smoke.js` reads it via `section.querySelector('[data-role="smoke-act"]')`. The real `bnt_explainer.js` doesn't touch it, but it's smoke-fixture-specific DOM in a production component. Either delete (when G.1.c.3 replaces smoke content with real bnt_explainer section DOM) or comment why it's there. Comment-now, delete-in-G.1.c.3 is fine.

### 1.3 `window.Reveal` is not cleared on component unmount — stale stub persists globally [should-fix — S2]

`components/RevealExplainer/index.tsx` lines 281–288 (cleanup closure): `stubRef.current = null` but `window.Reveal` still points to the now-defunct stub. Benign today (bnt_explainer uses the closure argument, not the global), but a latent confusion source after SPA navigation. Add `(window as { Reveal?: unknown }).Reveal = undefined`.

---

## 2. What this PR doesn't address but should — probing for G.1.c.3 readiness

### 2.1 Handshake sequence — verified correct against the real bnt_explainer.js source [fine]

Full walk-through (mount → load → attach → set statusRef → emit ready → init() → goTo(1) → setStatus → useEffect → syncFragments → emit fragmentshown → goTo(1) again): correct ordering, idempotent on the redundant goTo. Worth a one-line comment at line 293 noting the redundancy is intentional belt-and-suspenders for cases where act state changes while status is still queued.

### 2.2 `slidechanged` is never emitted — canvas resize won't fire after viewport changes [should-fix — S3]

`bnt_explainer.js` `attach()` registers a `slidechanged` handler that calls `e.engine.resize()` on every engine. That's the ONLY code path that resizes canvases. The wrapper never emits `slidechanged`, so post-mount viewport resizes (web fonts loading, side panel expanding, window resize) leave the canvas drawing with a stale `getBoundingClientRect()` from inside the constructor. One-line fix at line 229: `stub.emit("slidechanged")` between `emit("ready")` and `setStatus("ready")`. For G.1.c.3, also wire a `ResizeObserver` on the section element to re-emit on dimension changes.

### 2.3 `window.Reveal` overwrite under three simultaneous instances [should-fix — S4]

Three `<RevealExplainer>` instances on the bnt-cnn page each write `window.Reveal = stub`. The last one wins. Traced through bnt_explainer.js: doesn't matter for that explainer (uses closure argument), so functionally safe today. But the comment at line 160–162 frames it as a supported convention. Either suppress the publication entirely (bnt_explainer doesn't read it) or add a note: "Note: with multiple instances mounted, `window.Reveal` points to the last-mounted stub. Future explainers must use the `Reveal` closure argument from `attach()`, not the global."

### 2.4 Fragment-state emulator math vs real bnt_explainer.js — verified [fine]

For act N: wrapper sets N-1 frags `.visible`, real explainer reads `shown = N-1`, calls `engine.goTo(N)`. Off-by-one is correct. `fragmentMarkers` count = `acts - 1` matches the convention (N fragments = N+1 acts).

### 2.5 `bnt_explainer.js` `_engines` accumulates across SPA navigations — RAF leak risk [should-fix — S5, G.1.c.3]

bnt_explainer is a module-level singleton with `_engines: []`. Each `attach()` appends. SPA navigation away from the halo page detaches the DOM but leaves the engine in `_engines`. If engines use `requestAnimationFrame` for their draw loops (likely), the RAF loop ticks on a detached canvas indefinitely — CPU drain. Two fixes for G.1.c.3: (a) filter `_engines` in `_syncFromReveal` to skip detached sections via `document.contains(e.section)`, OR (b) add a `stop()` method to engines and call it from RevealExplainer's cleanup. This is G.1.c.3 work, not this PR — but it must land BEFORE any real explainer is wired in, or shipping a halo page causes a background CPU drain.

### 2.6 `slidechanged` on mount handles initial sizing AND post-layout resize [fine — covered by S3]

### 2.7 IntersectionObserver fast-scroll skipping [fine, with note]

Real but known limitation of IO for scrollytelling. Worth a comment at line 330 for whoever tunes beat heights in G.1.c.3.

### 2.8 Sticky layout correctness [fine, with note]

Valid in smoke page. Real MDX page: works as long as no ancestor in `app/p/[haloId]/page.tsx` adds `overflow: hidden`. Flag for G.1.c.3.

### 2.9 Smoke fixture faithfully mirrors real coupling, not a strawman [fine]

The fixture's `isReady` branch is the same code path bnt_explainer.js takes. Tests the same handshake.

### 2.10 Test coverage gaps — two scroll-path cases missing [should-fix — S6, G.1.c.3]

(a) Scroll forward to Beat 5 then BACKWARD to Beat 1 — IO's topmost-in-entries logic is untested in reverse.
(b) Button click + IO race: after `goToAct(3)`, the scroll-into-view animation may have intermediate beats briefly intersect, possibly overwriting the act. Assert post-300ms-wait that the act stays at 3. Both for G.1.c.3.

### 2.11 `<aside role="status">` dynamic-insertion a11y gap [nit — N2, G.1.c.3]

NVDA/JAWS on Windows may not announce live-region content if the container was absent at page load. Pre-render the aside as empty, populate on failure. Joins the deferred-a11y bucket (aria-live caption, reduced-motion, mobile autoplay) in G.1.c.3.

---

## 3. Test route production exposure

### 3.1 No internal information leaked [fine]

`process.env.ATLAS_TEST_ROUTES === "1"` evaluates at build time. Production HTML is a single inert paragraph. `robots: { index: false, follow: false }`. Clean.

### 3.2 RevealExplainer code is in the shared client bundle [fine — acknowledged]

Visiting `/smoke/explainer/` in production loads the bundle but never mounts the wrapper. `next/dynamic` with `ssr: false` is a future hardening option if bundle hygiene matters.

### 3.3 `ATLAS_TEST_ROUTES=1` does not persist to production CI [fine]

Set inside `playwright.config.ts`, isolated to the Playwright runner. Vercel build environment is entirely separate. Confirmed.

---

## Issues

### Must-fix
None. The core architecture is correct.

### Should-fix — in this PR
**S1** — Comment `<span data-role="smoke-act">1</span>` (line 409) as fixture-specific.
**S2** — Clear `window.Reveal` in cleanup (lines 281–288).
**S3** — Emit `slidechanged` after `emit("ready")` (line 229). Most practically load-bearing — first visible bug in G.1.c.3 without it.
**S4** — Document or suppress the `window.Reveal` overwrite under multi-instance.

### Should-fix — first work of G.1.c.3
**S5** — RAF leak via `_engines` accumulation. Filter detached sections in `_syncFromReveal` or add `stop()` to engines + RevealExplainer cleanup. Must land before real explainer wires in.
**S6** — Add backward-scroll test and button+IO-race test.

### Nits
**N1** — Fix the misleading "React commit phase" comment at lines 124–129.
**N2** — Pre-render the live-region `aside` as empty so AT announces correctly. Joins the deferred-a11y bucket for G.1.c.3.

---

## Bottom line

Sign off after S1–S4 are addressed in this PR; S5 and S6 are the first work of G.1.c.3. S3 is the most practically load-bearing — it will be the first visible bug in G.1.c.3 when the cloud canvas draws at the wrong aspect ratio because `resize()` never fired post-mount. S5 is the most architecturally dangerous and must land before any real explainer is wired in. S1 and S4 are one-liners that prevent future confusion. The core architecture — fragment-state DOM emulator, `statusRef` shadow for `isReady()` ordering, basePath-prefixed dynamic injection, `queueMicrotask` for the already-loaded remount path, listener Map per instance — is correct and the Copilot fixes held up under scrutiny. The handshake sequence (the central concern from V2_PLAN_REVIEW §1.1) is verified correct: `isReady()` returns false during `attach()`, defers via `Reveal.on("ready", init)`, receives the synchronous `emit("ready")` after `statusRef` is flipped, and `init()` fires with a live DOM. The wrapper is structurally ready for G.1.c.3 once S1–S4 land.
