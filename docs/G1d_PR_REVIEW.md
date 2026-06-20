# G.1.d PR Review — homepage halo click → /p/[haloId]

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #14. Copilot quota exhausted.
**Branch reviewed:** `v2.0-homepage-halo-click` at HEAD.
**Prior reviews:** G0, G1a, G1b, G1c1, G1c2, G1c3a, G1c3b — findings not repeated.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address soon, **[nit]**, **[fine]**.

---

## 1. What's wrong, broken, or fragile

### 1.1 Both navigation tests click before confirming canvas hydration; negative test can pass vacuously on slow CI [should-fix — S1]

`tests/e2e/homepage.spec.ts` lines 141–146 and 177–182. The existing smoke test (lines 63–79) polls `canvas.width > 100` before proceeding. React event handlers are attached during hydration, which completes after the ResizeObserver fires. The new tests call `toBeVisible` then click immediately — React may not have wired `onClick` yet.

- **Positive test** (bnt-cnn): pre-hydration click = no navigation → waitForURL times out → loud failure. Informative.
- **Negative test** (thesis): pre-hydration click is ALSO a no-op. "URL unchanged" passes — for the wrong reason. The test would pass even if `isClickable` were deleted. Silent false-positive risk.

Add the same `canvas.width > 100` poll before both clicks. Copy-paste from lines 70–79.

### 1.2 `isClickable` default (undefined → all-clickable) is the wrong semantic for a navigation guard [should-fix — S2]

`components/CosmicWebMap/index.tsx` lines 146–147. `clickableHaloIds === undefined ? true : has(id)` means a future `linkPrefix`-without-`clickableHaloIds` call routes every halo click to potentially-nonexistent pages. Safer default: `false`. Today's only caller always passes the prop, but the API reads backward to its stated intent.

### 1.3 "label and links" in the comment misrepresents what the hover overlay draws [nit — N1]

`components/CosmicWebMap/index.tsx` line 178. `renderHoverOverlay` only calls `drawHalo` (brighter glow) + `drawHaloLabel` (canvas text). No links, no metadata card, no DOM elements. Fix to "label."

### 1.4 `VIEW_W`/`VIEW_H` duplicated in the test [nit — N2]

`tests/e2e/homepage.spec.ts` lines 29–30. `colors.ts` exports these. Drift risk on rename.

### 1.5 Probed concerns that turned out fine

- **Set serialization Server→Client**: React Flight (`react-server-dom-webpack`) explicitly handles Set. Verified in `out/index.html` RSC payload: `"clickableHaloIds":"$Wf"` with `"f":["bnt-cnn"]`. On client, `.has("bnt-cnn") === true`. No bug.
- **`async` Server Component + `output: 'export'` + `fs.readdir`**: confirmed pre-renders at build time. `out/index.html` exists. No request-time `readdir`.
- **250ms timer in negative test**: `router.push` is synchronous `pushState`. 250ms is orders of magnitude more than needed for static export. The hydration concern (S1) is a different issue.
- **Hover overlay on non-clickable halos**: canvas-only (label + glow), no DOM that could mislead. Cursor stays `default`. Design is defensible.
- **Mobile tap**: `onClick` fires on touch. Hover overlay doesn't appear without mousemove, but tap-to-navigate works.
- **MDX-vs-route drift**: structurally impossible — `listMdxHaloIds()` drives both `clickableHaloIds` AND `generateStaticParams` from the same glob.

---

## 2. What this PR doesn't address but should

### 2.1 The canvas has no keyboard path to clickable halos [should-fix — S3]

`components/CosmicWebMap/index.tsx` line 174 `aria-label="Atlas — a personal cosmic web of projects"`. Pre-existing gap that the PR makes load-bearing: the bnt-cnn page is now reachable only by mouse. Keyboard / screen-reader users have no path. Fixing properly requires overlay `<a>` elements positioned over clickable halos, or canvas `tabindex` + `keydown`. Not a one-liner. Joins the G.1.c.3.c a11y pass.

### 2.2 Negative test doesn't assert `thesis.is_public` [nit — N3]

If a halos.json edit flips `thesis` to non-public, the test could pass for a different wrong reason (click hits empty canvas). Assert `target!.is_public === true` to make the assumption explicit.

---

## Bottom line

Sign off with S1 addressed. S2 + N1/N2/N3 are easy follow-ons in the same PR. S3 (keyboard a11y) joins G.1.c.3.c.

The core mechanics are solid: Set serialization works (verified from RSC bundle source and build artifact), static export pre-renders at build time, `isClickable` correctly separates bnt-cnn from all other halos. S1 is the only finding where I'm genuinely worried about a CI false-positive slip.
