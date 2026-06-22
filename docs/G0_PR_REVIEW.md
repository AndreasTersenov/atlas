# G.0 PR Review — Playwright + one e2e + CI

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #7 (`v2.0 G.0: stack-proof PR — Playwright + one e2e + CI`).
**Author of PR:** Claude A (Opus 4.7).
**Stance:** find what Copilot missed; the precedent of this PR matters more than its size.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1 starts, **[nit]**, **[fine]**.

---

## 1. What's still wrong or fragile after the Copilot pass

### 1.1 `webServer` runs `npm run dev` (Turbopack) while `npm run build` compiles a Webpack/production bundle — the test exercises neither target correctly **[must-fix]**

`playwright.config.ts` line 44: `command: "npm run dev"`. CI runs `npm run build` (line 58–59) then `npm run test:e2e` (line 61–62) — but `test:e2e` boots a fresh dev server, not the production build that was just verified.

The green CI check asserts: (a) production build compiles, AND (b) Turbopack dev server serves the canvas. It does **not** assert: (c) the production build serves the canvas. Turbopack and Webpack differ in tree-shaking, module boundaries, and HMR-related side effects — a subtle difference could cause the prod build to silently omit a dependency that works fine in dev.

**Fix.** Option A (clean): build the static export and serve `out/` — but requires `output: 'export'` in `next.config.ts`, which is G.1 work because it conflicts with v1 cockpit's `dynamic = "force-dynamic"` routes still on this branch. Option B (immediately valid): split CI into a `build` job and an `e2e (dev)` job, both running in parallel, with explicit, distinct charters. Renaming the e2e step makes the limitation honest and forces G.1 to land Option A. Apply Option B in this PR.

### 1.2 `waitUntil: "domcontentloaded"` is a fragile baseline for an asynchronous-boot React component **[should-fix]**

`tests/e2e/homepage.spec.ts` line 36. `domcontentloaded` fires before module scripts execute and before React hydrates. The `toBeVisible` + `expect.poll` timeouts cover the happy path, but a `console.error` emitted *during* hydration (e.g. a font-load failure from `next/font/google`) is captured by the listener registered at line 26 and fails the test at line 74 — masking later assertions. Change to `waitUntil: "load"` so we proceed only after all resources finish fetching, which is the point at which React reliably hydrates.

### 1.3 No concurrency control — rapid pushes produce redundant parallel runs **[should-fix]**

`.github/workflows/test.yml` has no `concurrency:` key. Two commits 20 seconds apart trigger two full 15-minute runs; the PR check list shows both as in-progress until both resolve. Add:
```yaml
concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true
```

### 1.4 `/playwright/.cache` in `.gitignore` ignores a directory that Playwright doesn't create **[nit]**

Playwright writes browser binaries to `~/.cache/ms-playwright` by default. The `.gitignore` line 19 entry is dead. Remove or replace with a comment pointing to the real cache location.

---

## 2. Infrastructure gaps this PR should address before G.1

### 2.1 `npm run build` in CI runs without env vars — fine today, foot-gun tomorrow **[should-fix]**

The cockpit pages import `lib/supabase-browser.ts` / `lib/supabase-server.ts`, which read `process.env.NEXT_PUBLIC_SUPABASE_URL!` with non-null assertions. Today, every cockpit page is `export const dynamic = "force-dynamic"` — Next 16 doesn't statically render them at build time, so the `!` assertion only evaluates at runtime. Build passes without env vars **today**.

As G.1 lands `generateStaticParams` for `/p/[haloId]`, a build-time-evaluated path may import the Supabase chain. The failure will be cryptic in a CI run with no env vars set. Either stub them with placeholder strings in the workflow's `env:` block now (anon key is safe to expose per `.env.example`; URL is public; service-role + PAT are unused by build), or document in `docs/V2_SHOWCASE_PLAN.md` that G.1 starts with adding env vars to CI as its first step.

### 2.2 `.env.local` contains live credentials one git misfire away from being committed **[must-fix — separate from this PR]**

`.env.local` contains `SUPABASE_SERVICE_ROLE_KEY` (full JWT bypassing RLS) and `GITHUB_PAT=ghp_...` (classic token with `repo` scope on a public repo). `.gitignore` covers it correctly, but the PAT in particular is a write-credential to a repo that v2 is about to go public on. Rotate the PAT to a fine-grained token with read-only scope on specific repos before any v2 PR exposes its existence. Pre-existing condition, not introduced by this PR, but CI automation being added now is the right moment.

### 2.3 Fork PR security — workflow runs in untrusted context when repo goes public **[should-fix]**

`pull_request` trigger runs for fork PRs once the repo is public. `github.token` is read-only in that context, which is acceptable today. If §2.1 lands real secrets in the workflow, those become accessible to fork-PR workflows. Either gate the job on `github.event.pull_request.head.repo.full_name == github.repository`, or switch to `pull_request_target` with explicit permissions. Required before v2 goes public.

---

## 3. The cosmic-web map test oracle

### 3.1 `canvas.width > 100` proves the ResizeObserver fired, not that anything rendered **[must-fix]**

Tracing the code path in `components/CosmicWebMap/index.tsx`:

```ts
// apply() at lines 82–98:
canvas.width = Math.round(w * dpr);   // what the test polls
canvas.height = Math.round(h * dpr);
rebuildStatic();                       // may throw
repaint();                             // skipped if rebuildStatic threw
```

Setting `canvas.width` resets the canvas to fully transparent. If `rebuildStatic()` throws (e.g. inside `renderStatic`, which calls 9+ drawing functions with no internal error handling), `repaint()` doesn't run. The visible canvas stays transparent. `canvas.width` is already > 100. The test passes. The screenshot looks empty but the test is green.

**ResizeObserver callbacks swallow thrown exceptions** — they fire via the browser's task queue, not a synchronous call stack. There's no `try/catch` in `apply()`. The exception is lost to the void. The current test would not catch any of these failure modes.

Concrete failure mode: change `data/halos.json` to mark every halo `is_public: false`, and `app/page.tsx` passes an empty array to `CosmicWebMap`. The drawing functions handle empty arrays without error, the canvas is dark nebula with no halos, the test passes. Andreas's homepage is unusably blank.

**Fix.** Add a center-pixel probe asserting (a) alpha > 0 (the canvas was actually drawn to, not just resized) and (b) the pixel is not the pure background colour `#1A0828` = `rgb(26, 8, 40)` (at least the nebula tint or halo layer rendered on top).

```ts
const probe = await canvas.evaluate((el) => {
  const c = el as HTMLCanvasElement;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const { data } = ctx.getImageData(
    Math.floor(c.width / 2),
    Math.floor(c.height / 2),
    1, 1
  );
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
});

expect(probe).not.toBeNull();
expect(
  probe!.a,
  `canvas center pixel is transparent — renderStatic likely threw silently inside a ResizeObserver callback that swallowed the exception`
).toBeGreaterThan(0);
expect(
  probe!.r === 26 && probe!.g === 8 && probe!.b === 40,
  `canvas center is pure background #1A0828 — nebula tint and halo layers didn't render`
).toBe(false);
```

DPR-invariant because center coords scale with the canvas backing store size.

### 3.2 The `pageerror` listener ordering is correct **[fine]**

Listeners attached before `goto` — they capture errors throughout, including during screenshot capture. Final assertion at line 74 captures everything.

---

## 4. Reproducibility

### 4.1 Fresh checkout fails with "executable doesn't exist" — no documented local setup step **[should-fix]**

`npm ci` installs `@playwright/test` but not the Chromium binary. A new contributor sees:
```
Error: Executable doesn't exist at ~/.cache/ms-playwright/chromium-.../chrome-linux/chrome
```

Add a `"setup"` script to `package.json`: `"setup": "playwright install chromium"`. Document in `AGENTS.md` or `README.md`: "After cloning: `npm install && npm run setup`."

### 4.2 macOS Retina vs Linux CI: DPR differs, but the center-pixel probe is DPR-invariant **[fine for §3.1 fix]**

`devicePixelRatio` = 2 on Retina, 1 on CI. The current `> 100` width check is insensitive. The center-pixel probe in §3.1 uses `c.width/2, c.height/2` which scales with the backing store, so the center maps to the same logical position regardless of DPR.

When future tests use `toHaveScreenshot` baselines, explicitly set `deviceScaleFactor: 1` in the Chromium project to prevent Retina vs CI mismatches.

### 4.3 `reuseExistingServer: !process.env.CI` silently tests a stale local server **[nit]**

Standard Playwright tradeoff. The config comment is honest about it. Note as a known local-only foot-gun.

---

## Bottom line

**Do not squash-merge as-is. Two must-fixes, both about the gap between what a green check claims and what it proves.** First, split the CI workflow into a `build` job and an `e2e (dev)` job — the current config sequentially runs build and then a dev-server-backed test, conflating two distinct guarantees into one ambiguous green check. Second, replace `canvas.width > 100` with a center-pixel alpha + colour probe — the current oracle passes for "ResizeObserver fired but renderStatic threw silently and the canvas is transparent," which is the exact failure mode this test was supposed to catch. Both fixes are small; both are load-bearing for the precedent this PR sets. The should-fix items (`waitUntil: "load"`, concurrency block, `npm run setup` onboarding, env-var stubs in CI) won't block the merge but will bite the first downstream contributor within two sessions. Pre-existing: rotate the `GITHUB_PAT` in `.env.local` before the v2 repo goes public — that's separate from this PR but adjacent in time.
