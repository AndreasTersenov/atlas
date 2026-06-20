# G.1.c.3.a PR Review — real bnt_explainer port + RAF leak fix

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #12. Copilot's review quota was exhausted on this account, so this is the only review.
**Branch reviewed:** `v2.0-bnt-explainer-port` at HEAD.
**Prior reviews:** G0, G1a, G1b, G1c1, G1c2 — findings not repeated.
**Upstream diff:** `bnt_explainer.{js,css}` fetched from `github.com/AndreasTersenov/talks` HEAD and compared line-by-line. Results in §8.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1.c.3.b starts, **[nit]**, **[fine]**.

---

## 1. The S5 fix and its test

### 1.1 `_syncFromReveal` filter correctness [fine]

`public/explainers/bnt_explainer.js` lines 1145–1153. `document.contains(e.section)` is the correct test. Returns false for detached subtrees. Prevents new `goTo()` calls on detached engines — that's the right scope. The mechanism comment (lines 1135–1144) is broadly correct; one nuance: `goTo()` calls `start()`, which calls `requestAnimationFrame` only if `this.running` is already false, so re-arm happens on the next sync *after* a tween settled, not during one. Doesn't change correctness; worth noting for future readers.

The fix does NOT stop a RAF loop that is mid-tween when navigation happens. That loop runs until `moving` falls false (~8–12 frames at SMOOTH=0.12, sub-second). Bounded and acceptable.

### 1.2 What the S5 test actually proves [must-fix — M1]

`tests/e2e/bnt-port.spec.ts` lines 113–123 count entries in `_engines` whose section is in the live DOM. The comment claims this proves "what `_syncFromReveal`'s S5 filter sees" — but the test applies the same filter independently in the probe. Removing the `document.contains` guard from `_syncFromReveal` does NOT break this test. The patch is not load-bearing to the assertion.

The real safety property — "the detached engine's RAF loop is not running" — is not asserted. Add an assertion on `engine.running` for the detached entries after a 500ms settle:

```ts
await page.waitForTimeout(500);
const detachedStillRunning = await page.evaluate(() => {
  const engines = (window as { BNTExplainer?: { _engines: { section: HTMLElement; engine: { running: boolean } }[] } }).BNTExplainer?._engines;
  return engines?.some((e) => !document.contains(e.section) && e.engine.running) ?? false;
});
expect(detachedStillRunning).toBe(false);
```

A working fix produces `false`; a broken fix (patch removed) produces `true` if navigation happened mid-tween. That's the load-bearing assertion.

Side note: `_engines` grows unbounded. After N visits, `_syncFromReveal` walks N entries on every fragmentshown event. Benign at typical session lengths; worth a one-line comment at line 1052 noting "this array never shrinks; the S5 filter makes the walk cheap in practice."

---

## 2. Canvas width `>100` assertion [must-fix — M2]

`tests/e2e/bnt-port.spec.ts` lines 74–80. The comment claims "Empty viewport / failed attach → width stays at the HTML attribute default (1520, 640). A sized canvas reads >100 once layout runs."

**The comment is wrong.** The HTML attribute on the cloud canvas is `width={1520}` (page.tsx line 75). `_setupCanvas` sets `canvas.width = Math.round(cssW * dpr)`. If `_setupCanvas` never runs, canvas.width stays 1520. `1520 > 100` is true. The assertion passes on failed attach.

Tracing the Engine constructor: `_buildMeter()` (line 178) runs BEFORE `_setupCanvas` (line 180). If the constructor throws at line 178 (e.g., `this.meterEl` is null because `sectionContent` omitted `.bnt-meter`), `_setupCanvas` never runs, but canvas.width is still 1520. Test passes despite a broken engine. This is not hypothetical — it's the exact failure mode S1 below describes.

The only failure case the assertion would catch: a sub-50px viewport. That's a test-infra problem, not a port regression.

**What actually catches port regressions in this test:** the `consoleErrors` afterEach (lines 41–47) and the `[data-role="act-counter"]` "1 / 5" assertion (lines 83–87). The counter only renders after `setStatus("ready")`, which requires `attach()` to complete without throwing. Those are the load-bearing positive signals.

Delete the canvas-width assertion. Correct the comment. Or replace with a genuine engine-state probe:

```ts
const engineAct = await page.evaluate(() => {
  return (window as { BNTExplainer?: { _engines: { engine: { act: number } }[] } })
    .BNTExplainer?._engines[0]?.engine.act;
});
expect(engineAct).toBe(1);
```

That's only true if the engine constructed and `goTo(1)` was called by `_syncFromReveal`. Real positive signal.

M2's misleading comment is the more dangerous artifact — it will directly mislead whoever debugs the first real port regression.

---

## 3. The `sectionContent` prop

### 3.1 Ordering [fine, with JSDoc note]

`sectionContent` rendered before `fragmentMarkers`. The `.bnt-frag` count via `querySelectorAll` doesn't care about DOM order. Add to the JSDoc: "Do not include `.bnt-frag` elements — that class name is reserved for the wrapper's fragment markers."

### 3.2 Missing `sectionContent` with a real engine [should-fix — S1]

If `module="bnt_explainer"` and `sectionContent` is undefined, the Engine constructor's `this.meterEl.innerHTML` throws (meterEl is null). The throw propagates from `init()` through `onLoaded()` (no try/catch in the wrapper) to a pageerror. `setStatus("failed")` never runs. The error UI never renders. User sees a blank section.

One-line dev guard in `onLoaded()` before calling `attach()`: if `NODE_ENV !== "production"` and `sectionContent === undefined` and `moduleName !== "_smoke"`, console.warn. Catches the mistake at the right moment. Footgun in G.1.c.3.b when mechanism and twopoint join.

### 3.3 Missing `sectionClassName` with real engine [fine]

Visual regression (unstyled), not a crash. Documented. The harness in this PR correctly supplies `bnt-slide`. Fine.

---

## 4. Keydown listener body — multi-instance behavior [should-fix — S2]

`public/explainers/bnt_explainer.js` lines 1102–1111. The listener checks `s.matches(".present, [data-bnt-active]")` first, falls back to "first live engine."

**Neither selector is ever set in Atlas.** Full-codebase search confirms it. `.present` is a Reveal.js convention (Atlas doesn't use Reveal). `[data-bnt-active]` is invented by the patch but nothing sets it. The first branch is dead code on every keypress.

For this PR (single-instance harness): fallback fires, autoplays cloud. Correct.

For G.1.c.3.b (three engines on bnt-cnn): fallback always autoplays cloud, even when the user has scrolled into mechanism or twopoint. Diverges from the intended "autoplay the engine in view."

Fix before G.1.c.3.b: have `RevealExplainer` set `data-bnt-active` on `sectionRef.current` when its IntersectionObserver determines the component is the most-visible instance. The keydown listener's existing `[data-bnt-active]` check then routes correctly without touching the patch.

---

## 5. Visual fidelity — CI-runnable regression test [nit — N1]

The PR's "verified by `npm run dev`" is manual. Test suite doesn't distinguish "engine attached + working" from "script loaded but broken." Smallest CI probe: after counter shows "1 / 5", call `engine.goTo(3)` via page.evaluate, assert `engine.act === 3`. Only true if `goTo` ran and `_stateForAct(3)` succeeded. Add in G.1.c.3.b.

---

## 6. ESLint exclusion [fine]

Patches use only `var` + standard DOM APIs — nothing strict lint would flag. Exclusion protects upstream ES5 idioms, not bugs in Atlas code.

---

## 7. What this PR doesn't address vs G.1.c.3.b

### 7.1 `sectionContent` at three-engine scale [should-fix — S3, before G.1.c.3.b]

Cloud scaffolding in `page.tsx` is ~45 JSX lines. Mechanism: similar. Twopoint: smaller. Inline in MDX, three engines = ~130 lines of wire-harness JSX vs content. Decision needed before G.1.c.3.b: extract `<BNTCloudSection />` / `<BNTMechSection />` / `<BNTTwoPtSection />` to `components/BNTExplainer/` or similar. The `sectionContent` prop accepts `ReactNode`, so they slot in directly.

### 7.2 Strict-mode double-mount [fine]

Next 16 App Router has `reactStrictMode: true` by default. React creates fresh DOM nodes on remount. `init()` finds the new node, `_bntEngine` is undefined, fresh engine builds. Stale entry stays in `_engines`; S5 filter skips it. Works correctly without additional code. A comment in the test noting this isn't explicitly tested would help.

### 7.3 S6 backward-scroll + IO-race tests [deferred — G.1.c.3.b]

G1c2 §S6 queued these as first work of G.1.c.3. They belong in G.1.c.3.b where real MDX makes scroll behavior testable with real stakes.

### 7.4 Resize handling [fine — deferred to G.1.c.3.c per PR]

The window-resize listener in the Engine constructor handles viewport resize. G1c2 §S3's `emit("slidechanged")` handles font-load shifts at mount. Full `ResizeObserver` is correctly deferred.

---

## 8. Upstream diff

Fetched `bnt_explainer.{js,css}` from `talks/HEAD/NonGaussian_Universe_2026/`.

**JS diffs (both tagged `// Atlas v2 patch`):**
1. Lines 1083–1114: keydown listener — `_keydownWired` guard + live-engines body.
2. Lines 1133–1153: `_syncFromReveal` — `document.contains` filter.

**No untagged diffs anywhere in the 1159-line file.** Rest is byte-identical to upstream.

**CSS:** byte-identical. Zero diffs.

The tagging strategy works. A re-port can `grep "Atlas v2 patch"` to find divergences.

---

## Issues

### Must-fix
**M1** — `tests/e2e/bnt-port.spec.ts` lines 113–123: S5 test proves array shape, not filter execution. Add `detachedStillRunning` assertion on `engine.running`.

**M2** — `tests/e2e/bnt-port.spec.ts` lines 74–80: canvas `width > 100` passes trivially on failure (HTML attribute default 1520 > 100). Misleading comment. Delete the assertion or replace with engine-state probe; correct the comment.

### Should-fix — before G.1.c.3.b
**S1** — Dev-time warn for missing `sectionContent` with a real engine in `components/RevealExplainer/index.tsx`.

**S2** — `RevealExplainer` sets `data-bnt-active` on the section so the patched keydown listener routes R-key correctly under multi-instance.

**S3** — Extract `<BNTCloudSection />` etc. from inline scaffolding before G.1.c.3.b's MDX.

### Nit
**N1** — `engine.goTo(3)` + `engine.act === 3` probe in G.1.c.3.b makes engine-logic testable without pixel diffing.

---

## Bottom line

Sign off after M1 and M2 are addressed in this PR — both test-correctness issues, M2's misleading comment is the more dangerous artifact because it will directly misdirect the first real port-regression debugging session. The port itself is clean: no untagged upstream drift, CSS byte-identical, `_bntEngine` guard handles strict-mode double-mount, `document.contains` filter closes the right scope of the RAF problem. S1–S3 are real risks but only matter when G.1.c.3.b lands real content — they don't block this PR.
