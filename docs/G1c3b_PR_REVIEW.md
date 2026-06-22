# G.1.c.3.b PR Review — three-engine bnt-cnn + S2/S3/S6/N1

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #13. Copilot quota exhausted again; this is the only review.
**Branch reviewed:** `v2.0-bnt-three-engines` at HEAD.
**Prior reviews:** G0, G1a, G1b, G1c1, G1c2, G1c3a — findings not repeated.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1.c.3.c starts, **[nit]**, **[fine]**.

---

## 1. What's wrong, broken, or fragile

### 1.1 TwoPoint Beat 3 narrates act 4 while canvas shows act 3 [must-fix — M1]

`content/halos/bnt-cnn.mdx` lines 121–125. Beat 3 text: "Keeping only the diagonal (auto-only ℓ¹) throws away the off-diagonal information. That projection is not invertible."

Engine truth: twopoint act 3 = `{ showCp: 1, showInv: 1, showAuto: 0 }` (`bnt_explainer.js` `_stateForAct(3)` ~ line 960). `showInv: 1` triggers the "× B⁻¹ ( · ) B⁻ᵀ → exact ✓" annotation. **Act 3 is the invertibility step**, not the auto-only step. The "diagonal → can't invert" narrative is act 4 (`TP_COPY[4]`).

Beat 3 prose narrates act 4 while the canvas shows act 3. When the user scrolls to Beat 3 and the IO fires, the canvas displays "exact ✓" but the text says "that projection is not invertible." Direct visual/prose mismatch. Beat 4 then re-narrates the auto-only result while the canvas IS showing auto-only — partially correct but doubles up on the wrong content. Both beats need rewriting.

### 1.2 TwoPoint Beat 5 asserts an irreducibly-joint residue that the engine explicitly flags as wrong [must-fix — M2]

`content/halos/bnt-cnn.mdx` lines 130–135. Beat 5 text: "But there's a residue: the part of the higher-order ℓ¹ structure that is genuinely joint and irreducibly multi-map. The CNN's learned mixing captures it; auto-only summaries can't."

`bnt_explainer.js` line 35 (header comment): "(The irreducibly-joint share is ~ 0.)" Line 34 of the same comment block explicitly lists "the loss is a frame effect that whitening fully reverses (NOT 'irreducibly joint')" as one of the traps avoided. `TP_COPY[5]`: "survives BNT ⇔ you can reassemble it. … The ℓ1 / peaks: no, because B mixes the maps and then the histogram throws away the joint (a mix-then-marginalize); no per-channel set closes. That is the collapse."

Beat 5 says the exact framing the engine's own author flags as the central wrong framing. Worse than a placeholder — a confident claim in the opposite direction.

### 1.3 Mechanism Beat 4 ambiguous on the cross-recovery share [should-fix — S3]

`content/halos/bnt-cnn.mdx` line 91: "Adding cross-maps recovers some of the signal: the cross terms encode the cloud's joint structure. The CNN does even better because it can mix freely."

`MECH_COPY[4]` is precise: cross-maps recover only the pairwise share (0.22× FoM), not "the joint structure." A reader unfamiliar with the result could conclude cross-maps mostly solve the problem, which weakens the CNN comparison.

### 1.4 Prose-IO `data-bnt-active` semantics undocumented; "first-in-document-order wins" at section boundaries is real [should-fix — S1]

`components/RevealExplainer/index.tsx` lines 400–420. The prose IO uses `threshold: 0` on the prose column (~440vh tall in real content). On bnt-cnn three explainers are stacked. At each section boundary, two prose columns simultaneously intersect the viewport → both sections carry `data-bnt-active="true"`. The patched keydown handler at `bnt_explainer.js` line 1106 iterates `_engines` in document order and breaks on the first match → cloud wins at the cloud/mechanism boundary.

Deterministic, not a crash, but the next pass may change `threshold` to `0.5` thinking it'll be more intentional — that would desync the R-key routing from the act-counter advancement (beat IO uses `-20% 0px -20% 0px` rootMargin). Add a comment documenting the choice.

### 1.5 `waitForTimeout(350)` in the IO-race test [should-fix — S2]

`tests/e2e/explainer.spec.ts` lines 189–190. The sleep is meant to outlast Chromium's ~300ms smooth scroll. On slow CI, smooth scroll can take 400ms+; if the IO override fires at 380ms the test assertion at 350ms still passes, latent incorrectness survives. Replace the fixed sleep with a "scroll settled" wait — `await page.locator('[data-beat-n="3"]').waitFor({ state: "visible" })` plus a follow-up assertion is more deterministic.

### 1.6 S2 test on `bnt-port.spec.ts` tests page geometry, not multi-instance routing [should-fix — S4]

`tests/e2e/bnt-port.spec.ts` lines 163–191. Asserts `data-bnt-active="true"` is set on initial load of `/smoke/bnt-explainer/`. On that single-engine page the prose IS the page body — it intersects the viewport at any scroll position. Tests the IO is wired but not the multi-instance transition. Add the load-bearing assertion: on bnt-cnn, scrolling from cloud to mechanism makes mechanism's section gain `data-bnt-active`.

### 1.7 RevealExplainer `<section>` has no accessible name [should-fix — S5]

`components/RevealExplainer/index.tsx` line ~483. The `<section data-bnt-explainer>` has no `aria-label` or `aria-labelledby`. Screen readers announce it as an unnamed landmark. The preceding `<h2>` in the MDX is outside the wrapper component tree, so automatic labeling doesn't apply. Add an optional `label?` prop, set as `aria-label` on the section.

### 1.8 Prose-IO empty dep array uncommented [nit — N1]

`components/RevealExplainer/index.tsx`. Both refs are populated during React's commit phase before effects fire, so `[]` is correct. Without a comment, the next reader will question it or add `[proseRef.current, sectionRef.current]` (which would break the rule).

---

## 2. Editorial-placeholder Beats vs the engine's own physics

Confidence note: physics cross-check against `ACT_COPY` / `MECH_COPY` / `TP_COPY` in `bnt_explainer.js` and the file's header comments. The talk's `HANDOFF_BNT_VIZ_TALK.md` is not publicly accessible.

- **Cloud beats 1–5**: all five accurately match `ACT_COPY` and the engine header. Fine.
- **Mechanism beats 1–3, 5**: aligned with `MECH_COPY`. Beat 4 is the ambiguity in §1.3 (S3). Mostly fine.
- **TwoPoint beats 1–2**: aligned with `TP_COPY[1], TP_COPY[2]`. Fine.
- **TwoPoint beats 3, 4**: misaligned per M1. Must-fix.
- **TwoPoint beat 5**: contradicts the engine's own framing per M2. Must-fix.

The two-point block is the only one with physics errors. Cloud and mechanism beats need editorial polish (Andreas's pass) but don't contain wrong claims.

---

## 3. What this PR doesn't address vs G.1.c.3.c next

### 3.1 Three-engine simultaneous mount — CPU + script-load semantics [fine, verified]

Walked through the three-mount flow:
- All three `<RevealExplainer>` components inject the same `module="bnt_explainer"` → same `scriptId` and `linkId` → **only one `<script>` and one `<link>` tag in the document head**. Verified in the bnt-cnn build output. The dedupe via `getElementById(scriptId)` works as designed.
- First mount's `onLoaded()` runs `init()` which finds all three sections already in the DOM (React committed all three before effects ran) and creates all three engines synchronously. Subsequent `attach(stub2/stub3)` calls hit the `_bntEngine` guard → skip construction → only `_syncFromReveal` runs. No race. No accumulating drain.
- The S3 emit (`stub.emit("slidechanged")`) from G.1.c.2 fires three times (once per instance), each calling `_syncFromReveal` over all three engines. Six redundant `goTo()` calls at startup. All idempotent. Negligible cost.

### 3.2 `bnt_explainer.css` + `app/globals.css` interaction [fine]

`.bnt-slide` rules and `.reveal-explainer-*` rules use disjoint class names. The section element carrying both classes gets additive, non-conflicting styles. Verified.

### 3.3 a11y of three sections on the same page [should-fix — S5 above]

The three explainer sections all render as unnamed `<section>` landmarks (the wrapper renders generic `<section data-bnt-explainer>`). Three identical landmarks make screen-reader navigation confusing. S5 (label prop) is the fix.

### 3.4 `<aside role="status">` for load failures [fine]

Three instances mount, any one of which could fail. Each fallback renders within its own `.reveal-explainer-viz` container. They don't stack into one place — each is co-located with its broken explainer. Verified.

---

## 4. Issue summary

### Must-fix
**M1** — TwoPoint Beat 3 narrates act 4 while canvas shows act 3. Rewrite Beat 3 + Beat 4.
**M2** — TwoPoint Beat 5 contradicts the engine's own framing on irreducibly-joint residue. Rewrite Beat 5.

### Should-fix — before G.1.c.3.c
**S1** — Comment the prose-IO `threshold: 0` choice + first-in-document-order semantics.
**S2** — Replace `waitForTimeout(350)` with a scroll-settled wait.
**S3** — Tighten Mechanism Beat 4 on the pairwise share.
**S4** — Add a multi-instance routing test on the bnt-cnn page.
**S5** — Add `label` prop to `RevealExplainer`, use as `aria-label` on the section.

### Nits
**N1** — Comment the prose-IO empty dep array.

---

## Bottom line

Don't merge as-is. M1 and M2 are both text edits — ten minutes — but both are physics errors. M1 produces a visible/prose mismatch on every Beat 3 view; M2 ships a confident claim that contradicts the explainer author's central result. Fix both. S1–S5 are real but not blocking; land them in G.1.c.3.c. The code in this PR — sections extraction, three-mount flow, prose-IO wiring, test additions — is structurally sound.
