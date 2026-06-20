# G.1.a PR Review — v2.0: retire v1 routes + static-export config + production-mode e2e

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1.
**Branch reviewed:** `v2.0-config-migration` → `v2.0-showcase`.
**Prior review:** `docs/G0_PR_REVIEW.md` — findings not repeated here.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1.b starts, **[nit]**, **[fine]**.

---

## 1. What's still wrong or fragile after the Copilot pass

### 1.1 `lib/safe-next.ts` line 9 hardcodes `/cockpit` — missed by the drive-by cleanup **[nit]**

`lib/safe-next.ts`: `const FALLBACK = "/cockpit";`

The PR cleans up cockpit references in `components/CosmicWebMap/{index.tsx,colors.ts,renderer.ts}` and `app/globals.css`. This functional string in `safe-next.ts` was missed. The file is dead code (zero surviving app routes import it) so it doesn't affect runtime, but it will confuse a future grepper before G.1.f deletes it. Change to `"/"` or delete the file outright and add it to G.1.f's list.

### 1.2 `next.config.mjs` `env:` block is redundant and the comment is wrong **[nit]**

Lines 40–43:
```js
env: {
  NEXT_PUBLIC_ATLAS_BASE_PATH: basePath,
},
```
The comment claims this is what makes the value client-readable. It isn't — the `NEXT_PUBLIC_` prefix alone is sufficient and Next bakes the value via DefinePlugin unconditionally. The `env:` block is a legacy passthrough. Both paths resolve to the same string so it's harmless, but the comment is backwards. Remove the block; tighten the comment.

### 1.3 `reuseExistingServer` + build-and-serve = stale-artifact trap locally **[nit]**

Under the G.0 config (`npm run dev`), reusing a running server meant reusing a live HMR server. Under the new build-and-serve, reusing means reusing a `serve` process pointing at `out/` from the *last build*. Source changes are invisible. The test passes; the change is untested.

Either flip `reuseExistingServer: false` (forces rebuild every run; 30s cost acceptable for an e2e suite) or add an explicit warning that reusing tests stale output and the developer must kill `serve` to force a fresh build.

### 1.4 `serve` can orphan on test timeout — confusing CI failure mode **[should-fix]**

`playwright.config.ts`:
```ts
command: `npm run build && npx serve out -l ${PORT} --no-port-switching --no-clipboard`,
```

Playwright launches this via a shell. On clean shutdown, the shell signals its children. On hard kill (180s CI timeout, SIGKILL), the shell dies but `serve` — a grandchild — survives as an orphan holding port 3000. The next run fails with `EADDRINUSE :::3000` and the error looks like a build failure (npm exits 0, then serve can't bind), not a test failure.

Fix: prepend `exec` so `serve` becomes a direct child of the process Playwright manages:
```ts
command: `npm run build && exec npx serve out -l ${PORT} --no-port-switching --no-clipboard`,
```

---

## 2. Things the PR doesn't address but should

### 2.1 `legacy/v1.x` branch does not exist — and this PR deletes the v1 routes **[must-fix]**

`docs/V2_SHOWCASE_PLAN.md §C`:
> v1 cockpit + bridge: archived to branch `legacy/v1.x` (cut from main commit `8f1c988`) before deletion lands on main.

Confirmed via remote refs: there is no `legacy/v1.x` anywhere on origin. `main` currently sits at `8f1c988`. Once this PR squash-merges to `v2.0-showcase` and then `v2.0-showcase` fast-forwards `main`, the cockpit code is gone from `main`. The historical feature branches preserve dev history but not the clean "v1 finished artifact" point the plan asked for.

Cost to fix: 10 seconds.
```bash
git checkout -b legacy/v1.x 8f1c988
git push origin legacy/v1.x
```

Required before this PR merges so the archive window stays open.

### 2.2 Dead `lib/` files in TypeScript's `include` glob will break G.1.f's dep removal **[should-fix]**

`tsconfig.json` includes `**/*.ts`, which catches `lib/supabase-*`, `lib/atlas-*`, `lib/github.ts`, `scripts/atlas-bridge.ts`, `scripts/seed.ts`. `next build` typechecks all included files, not just the page graph.

Today: fine (SDKs still installed). In G.1.f when `@supabase/ssr` and friends are removed from `package.json`, `lib/supabase-server.ts:10` fails the typecheck — and the failure surfaces during webServer's `npm run build`, not test logic. The CI run shows "build failed" with the connection to G.1.f's dep cleanup not immediate.

Fix now via tsconfig `exclude` so dead files are invisible to tsc before G.1.f touches deps. Or make this the first step inside G.1.f. Either works — but the exclusion must precede `npm uninstall`.

### 2.3 The test verifies only the no-basePath build — no CI gate for the GH Pages target **[should-fix — pre-condition for G.1.c]**

`.github/workflows/test.yml` has no `env:` block setting `NEXT_PUBLIC_ATLAS_BASE_PATH`. The Vercel-target build is gated; the GH Pages target is tested only locally when the developer remembers to set the env var.

Not blocking G.1.a — `<RevealExplainer>` doesn't exist yet, so nothing basePath-sensitive can regress. But the CI gate must exist before G.1.c merges (that's the PR that builds the wrapper with basePath-prefixed asset URLs and exposes the silent-404 failure mode under GH Pages). Add to G.1.c's acceptance.

### 2.4 `out/` lacks `.nojekyll` — GH Pages will silently drop all JS bundles **[should-fix — before GH Pages workflow lands]**

Plan §H called for `.nojekyll` written into `out/` so Jekyll doesn't strip `_next/static/*` (underscore-prefix Jekyll convention). Confirmed: `out/.nojekyll` does not exist, and Next's `output: 'export'` does not emit it automatically.

Without it the GH Pages target loads HTML + CSS only — canvas never initialises, Playwright test against `serve` is green, mismatch between "CI green" and "GH Pages broken" takes time to spot. Belongs in the GH Actions workflow that lands later (`touch out/.nojekyll` before sync); not in `next.config.mjs`. Not blocking G.1.a; blocking before the first GH Pages deploy.

### 2.5 `images: { unoptimized: true }` is not cross-referenced where G.1.b authors will look **[nit]**

The config setting is correct. `V2_SHOWCASE_PLAN §G.1` step 2 doesn't mention that `<Image>` produces no responsive `srcset` under static export. Authors who go straight to the plan and don't read `next.config.mjs` may debug ghost-optimization. One-line note in the plan.

### 2.6 No leaked credentials or stale route references in `out/` **[fine]**

Direct grep over `out/`:
- No Supabase URL/key/service-role strings.
- No `cockpit` / `sign-in` / `auth/callback` / `api/integrations` references in any chunk.
- All asset URLs are `/_next/static/...` — correct for no-basePath build.

Five placeholder SVGs from `create-next-app` linger (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`). Harmless. Sweep in a later cleanup.

---

## 3. Static-export output audit

Covered in §2.6 + §2.4. Clean for no-basePath; missing `.nojekyll` for GH Pages.

---

## 4. Reproducibility and the `legacy/v1.x` archive

Already covered in §2.1. The archive must precede the squash-merge of *this* PR to `v2.0-showcase` (or at the very latest, before `v2.0-showcase` fast-forwards `main`). If skipped, the named-point archive opportunity is gone — though raw history survives on `v1.5-claude-observatory`.

---

## Bottom line

**Sign off after two must-fix items are addressed; the rest can land before G.1.b starts.**

First: create and push `legacy/v1.x` from `8f1c988`. The plan required this to precede the deletion; this PR *is* the deletion; ten seconds of git work closes the gap. Second: prepend `exec` to the `serve` command in `playwright.config.ts` so Playwright's signals reach `serve` directly. Orphaned `serve` processes manifest as `EADDRINUSE` masquerading as build failures, which is a real CI reliability landmine.

Everything else is either a nit (`safe-next.ts` fallback, redundant `env:` block, missing stale-cache warning) or a pre-condition for a downstream PR (tsconfig exclusion before G.1.f, basePath CI gate before G.1.c, `.nojekyll` before GH Pages workflow, `images` docs note for G.1.b). None block this PR. The production artifact is clean and the center-pixel oracle is intact.
