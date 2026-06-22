# G.1.c.1 PR Review — basePath CI gate

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #10.
**Branch reviewed:** `v2.0-basepath-gate` at HEAD (post-Copilot pass, commit `3274af5`).
**Prior reviews:** `docs/G0_PR_REVIEW.md`, `docs/G1a_PR_REVIEW.md`, `docs/G1b_PR_REVIEW.md` — findings not repeated.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1.c.2 starts, **[nit]**, **[fine]**.

---

## 1. What's still wrong or fragile after the Copilot pass

### 1.1 `reuseExistingServer` cross-target misfire is undocumented — will cost a G.1.c.2 developer time [should-fix — S1]

`playwright.config.ts` line 82. The existing comment covers the same-target stale-artifact case. The cross-target case is different and more insidious.

Walk-through: developer runs `npm run test:e2e` (TARGET=vercel) — Playwright spins up `serve out/`, tests pass, server is killed. Port 3000 free. Later they run `ATLAS_TEST_TARGET=ghpages npm run test:e2e`. `reuseExistingServer: true` (locally). Playwright probes `http://localhost:3000`. **If a separate `serve out/` is alive** — from a `npx serve out -l 3000` they started in a side terminal during the G.1.c.2 build cycle — Playwright reuses it, skips `ghpagesCmd` entirely, and the ghpages tests run against a vercel-target server. `p("/")` returns `/atlas/`, navigation hits `http://localhost:3000/atlas/`, the vercel `serve` 404s. The test fails with what looks like a broken build, not a "wrong server" error.

No false green — but the misdirected failure during G.1.c.2 development (the exact context this gate is for) is the failure mode this gate is supposed to *catch* surfacing as the failure mode itself.

One-paragraph fix in the existing caveat. No code change.

### 1.2 Redundant `NEXT_PUBLIC_ATLAS_BASE_PATH` shell prefix in `ghpagesCmd` [nit — N1]

`playwright.config.ts` line 47. Before the Copilot fix, the shell prefix was the only place the env var was set. The fix was line 30 (`process.env.NEXT_PUBLIC_ATLAS_BASE_PATH = BASE_PATH`), which writes into the Playwright runner's env *before* the webServer forks — the subprocess inherits it. The shell prefix on line 47 is now redundant. Two values agree, no bug — but the redundancy creates a reading trap: a future editor might see the prefix and conclude "line 30 isn't load-bearing," remove it, reintroduce the original bug.

Remove the prefix. Line 30 + the comment block on lines 21–27 is the single source of truth.

---

## 2. What this PR doesn't address but should

### 2.1 `cp -r out/. .test-mount/atlas/` — atomicity, hidden files, perms, symlinks [fine]

Atomicity: `&&`-chain guarantees `serve` only starts after `cp` exits 0. No partial-tree read window.
Hidden files: `out/` has no dotfiles currently. `cp -r src/. dest/` includes dotfiles on both BSD (macOS) and GNU (Linux) `cp` — POSIX-specified. The `.nojekyll` future addition will copy correctly.
Permissions: `cp -r` preserves; `serve` reads as Playwright uid. No elevation.
Symlinks: Next static export emits none. Verified on disk.

### 2.2 `.test-mount` and tsconfig `include` [fine]

tsconfig `include` would match `.test-mount/**/*.ts` if any existed. Glob confirms none — directory only contains compiled `.js` bundles, HTML, fonts, Next manifests. `tsc` never tries to parse them. No action needed.

### 2.3 `process.env` mutation as a module-load side effect [nit — N2]

`playwright.config.ts` line 30 mutates global `process.env` as a side effect of import. Within Playwright this is safe — the config always loads before test modules, so `url.ts`'s module-scope `const BASE_PATH = process.env...` reads the right value. The implicit contract is undocumented; a future contributor who imports `url.ts` from vitest (where the load-order guarantee doesn't hold) gets `p("/") === "/"` silently. One-line comment closes it.

### 2.4 Sequential local-target UX [see S1]

Covered in §1.1. Documentation fix.

### 2.5 `/atlas` hardcoded in two places [fine]

`playwright.config.ts` line 29 + `next.config.mjs` line 19 both read from / hardcode the same value. Extracting to a config constant adds a third configuration point without buying safety. Two hardcodes is minimal. A project-name rename is unlikely; the maintenance cost is acceptable.

### 2.6 404 test heading skip on ghpages — production behavior claim accuracy [fine]

The comment claims (a) locally `serve` falls through to a generic body because `404.html` is at `.test-mount/atlas/404.html` not at the served root; (b) in production GH Pages uses `andreastersenov.github.io`'s repo-root `404.html`, not Atlas's.

(a) verified: `serve-handler/src/index.js` line 492 joins the served dir with `${statusCode}.html`; the served dir is `.test-mount`, and `.test-mount/404.html` doesn't exist (only `.test-mount/atlas/404.html`). Falls through to generic. Skip is accurate.
(b) verified: GH Pages docs specify custom 404 must be at repo root; subdir `404.html` is not the GH-Pages handler.

Status-404 assertion on line 76 is the real gate and runs on both targets. Heading check is optional flavor on top.

### 2.7 `cp -r out/. .test-mount/atlas/` Linux vs macOS [fine]

POSIX-specified `src/. → dest/` idiom — copies *contents* into `dest`, not the directory itself. Both BSD and GNU `cp` implement correctly. Tree on disk confirms the right shape (no extra `out/` nesting). Symlink behavior differs between BSD (preserves) and GNU (dereferences) but Next emits none, so inert.

---

## 3. Matrix dimension and blast radius

**Both legs required, `fail-fast: false`: correct. [fine]**

`fail-fast: false` reports both legs independently — useful for "is the failure target-specific or universal?" diagnosis. Both required means a vercel-pass + ghpages-fail blocks merge. That's exactly the right blast radius. The whole motivation is to catch basePath regressions before `<RevealExplainer>` lands; advisory ghpages would hollow this out. G1b_PR_REVIEW §S5 was explicit that the gate must exist before G.1.c merges — required from day one matches the intent.

---

## Issue summary

### S1 Document the cross-target `reuseExistingServer` failure mode [should-fix — before G.1.c.2]

`playwright.config.ts` lines 79–81. Add a sentence to the existing caveat: a vercel-target `serve` alive on port 3000 causes the ghpages-target test to reuse the wrong server, producing misleading 404s rather than a clear "wrong configuration" signal.

### N1 Remove redundant shell prefix from `ghpagesCmd` [nit]

`playwright.config.ts` line 47. Line 30's `process.env` mutation is the single source; the shell prefix contradicts the comment block on lines 21–27.

### N2 Document load-order contract on the `process.env` mutation [nit]

`playwright.config.ts` line 30. One-liner: "Playwright loads this config before test modules, so url.ts reads the correct value at module-scope. Other runners (vitest, etc.) don't guarantee that ordering."

---

## Bottom line

Sign off after S1 is addressed; both nits are optional one-liners that improve future readability. The gate is structurally sound — Copilot's env-var split-brain fix is correct, `&&`-chained copy-then-serve is atomic, `exec` ensures clean signal delivery, the 404 test skip is accurate against `serve-handler` source and GH Pages docs, the matrix is symmetric and required, and `cp -r out/.` is portable. The only real gap is an undocumented local failure mode (S1) that will surface during G.1.c.2 development if a developer keeps a vercel `serve` running while switching to the ghpages target.
