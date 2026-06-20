# G.1.b PR Review — MDX content pipeline + /p/[haloId] route skeleton

**Reviewer:** staff-engineer adversarial pass per AGENTS.md §1, on PR #9.
**Branch reviewed:** `v2.0-mdx-pipeline` (post-Copilot pass, commit `95956f0`).
**Prior reviews:** `docs/G0_PR_REVIEW.md`, `docs/G1a_PR_REVIEW.md` — findings not repeated.

Verdict tags: **[must-fix]** blocks merge, **[should-fix]** merge but address before G.1.c starts, **[nit]**, **[fine]**.

---

## 1. What's still wrong, broken, or fragile after the Copilot pass

### 1.1 `mod` typed as a developer assertion — poor failure ergonomics when frontmatter is malformed [should-fix — S1]

`app/p/[haloId]/page.tsx` line 34: `let mod: { default: React.ComponentType; frontmatter: unknown };` is asserted, not derived. If a future MDX file's YAML is malformed enough that `remark-mdx-frontmatter` emits `undefined`, `HaloFrontmatter.parse(undefined)` throws a raw `ZodError` whose message doesn't name the offending `haloId`. With 23 halos, attributing the failure requires stack-trace archaeology. Replace `parse` with `safeParse` + a named throw so all build-time failures on this page are equally attributable (mirrors the `halo_id !== haloId` check Copilot added).

### 1.2 `notFound()` return-type narrowing is correct, but worth a comment [fine]

`notFound()` is typed `() => never`, so TS control-flow narrows `mod` to always-assigned after the try/catch. No bug. One line of comment helps the next reader.

### 1.3 Template-literal dynamic import: the critical invariant is undocumented [should-fix — S2]

The page comment explains the context-module mechanism but not the constraint. Both Webpack and Turbopack (default in Next 16 `next build`) statically analyse the literal to enumerate `content/halos/*.mdx`. If a future contributor wraps `haloId` in a transform (e.g. `slugify(haloId)`), static analysis breaks — build fails or bundles oversize. Not silent, but surprising. Add to the existing comment: "Keep `haloId` as a bare reference here. Wrapping it in a function call or conditional breaks the bundler's static context-module analysis."

---

## 2. Things this PR doesn't address but should

### 2.1 Dynamic import actually emits per-file chunks — verified [fine]

`out/p/bnt-cnn/index.html` is fully pre-rendered (title, tagline, link pills, MDX prose all in HTML source). Turbopack's `turbopack.md` lists dynamic `import` as fully supported. Pattern stable.

### 2.2 Type safety on the dynamic-import module shape [should-fix — S1]

`frontmatter: unknown` is the honest type — `remark-mdx-frontmatter` ships no declarations. The S1 `safeParse` mitigation is the correct fix.

### 2.3 `data/halos.json` import + incremental tracking [fine, with style note S3]

Module-level `halosJsonIds` is correct in production builds (fresh process per `next build`) and HMR-safe in dev. Latent stale-read risk only if a test harness modifies `halos.json` between calls. Moving the Set construction inside `listMdxHaloIds()` makes the function self-contained.

### 2.4 Tailwind 4 Oxide scanner and `.prose-atlas` [fine]

`.prose-atlas` is hand-authored CSS, not a Tailwind utility — needs no scanner discovery. The article wrapper class is in a `.tsx` file the existing `@source` directive already covers. No scanner gap.

### 2.5 `explainer:` block in G.1.c — other halos break? [fine]

`explainer` is `.optional()`. Adding it to `bnt-cnn.mdx` later doesn't affect other halos.

### 2.6 Orphaned-MDX drift — does the build catch it? [fine — airtight]

Walk-through: rename `bnt-cnn` → `bnt-cnn-v2` in `halos.json`; leave `bnt-cnn.mdx` orphaned. Layer 1 (`listMdxHaloIds`) throws because `bnt-cnn` is no longer in `halosJsonIds`. Caught. Four-case matrix:
- MDX filename not in JSON → Layer 1 throws.
- JSON id with no MDX → tolerated; route 404s. Intentional.
- MDX filename in JSON but frontmatter `halo_id` differs → Layer 2 throws.
- All consistent → succeeds.

Under `output: 'export'`, `next build` is always full — no skip path. Airtight. Header comment doesn't say JSON-without-MDX is tolerated; add one sentence (N1).

### 2.7 The 404 test's reliance on `serve` behavior — verified against source [fine]

`node_modules/serve-handler/src/index.js` lines 677–710 (unmatched → 404) and 492–516 (looks for `404.html`). `out/404.html` exists; its `<h2>` is "This page could not be found." Test is stable.

---

## 3. Build output and runtime behavior under the GH Pages target

Vercel target build: all asset URLs are `/_next/static/chunks/...` — correct.

Under `NEXT_PUBLIC_ATLAS_BASE_PATH=/atlas`:
- `<Link href="/">`: auto-prefixed by Next → `<a href="/atlas/">`. Correct.
- MDX `<img>`: `mdx-components.tsx` lines 26–30 apply `BASE_PATH`. Correct code path; not exercised by current placeholder (no images yet).
- `/_next/static/*` chunk URLs: emit with `/atlas/_next/...` throughout. Correct.
- `/atlas/p/bnt-cnn/` resolves to `out/p/bnt-cnn/index.html` (subdir via `trailingSlash: true`). Direct-link works.

**Missing from CI**: no gate for the basePath build (S5 carry-forward from `G1a_PR_REVIEW.md §2.3`). G.1.c's `<RevealExplainer>` introduces dynamically injected `<script>`/`<link>` tags — the exact failure class. Gate must exist before G.1.c merges.

---

## 4. Two-layer drift split — airtight?

Yes. §2.6 walks the four-case matrix. The only theoretical gap is a test harness that modifies `halos.json` between calls — production build never hits this (fresh process). S3 fixes it for tests.

---

## Issues

### S1 Use `safeParse` for attributable frontmatter errors [should-fix — in this PR]

`app/p/[haloId]/page.tsx` line 41. Replace `parse` with `safeParse` + named throw including the `haloId`.

### S2 Document the template-literal invariant [should-fix — in this PR]

`app/p/[haloId]/page.tsx` comment around lines 31–36. Add the bare-reference constraint sentence.

### S3 Move `halosJsonIds` Set inside `listMdxHaloIds()` [should-fix — in this PR or G.1.c]

`lib/halo-content.ts` lines 63–65. Module-level state is brittle in test harnesses; function-local is self-contained.

### S4 Add `generateMetadata` — every halo page inherits the site-wide title [should-fix — in this PR]

Confirmed in `out/p/bnt-cnn/index.html`: `<title>Atlas — a personal cosmic web</title>` — not the halo's title. This is a public showcase page; sharing a halo URL produces an OG card with no halo-specific information. `generateMetadata` is fully supported under `output: 'export'`. All data in scope:

```ts
export async function generateMetadata({ params }: PageProps) {
  const { haloId } = await params;
  try {
    const { frontmatter } = await import(`@/content/halos/${haloId}.mdx`);
    const fm = HaloFrontmatter.safeParse(frontmatter);
    if (!fm.success) return {};
    return { title: fm.data.title, description: fm.data.tagline };
  } catch {
    return {};
  }
}
```

Five lines. Land in this PR.

### S5 basePath CI gate — carry-forward, before G.1.c [should-fix]

Flagged in `G1a_PR_REVIEW.md §2.3`. Required before G.1.c merges.

### N1 Tolerated-case undocumented in `lib/halo-content.ts` header [nit]

"Tolerated" should say: "the route 404s because `generateStaticParams` only emits ids with MDX files, and `dynamicParams = false`."

### N2 Plan example frontmatter includes `status` + `domain`; schema strips them silently [nit]

`V2_SHOWCASE_PLAN.md §E` example has `status: active` and `domain: research`. Live MDX omits them (correct). Zod v4 strips unknowns by default. Either remove from plan example or add `.strict()` to the schema.

---

## Bottom line

Sign off after S1 (`safeParse`), S2 (template-literal comment), and S4 (`generateMetadata`) land in this PR; S3 can land alongside or in G.1.c. The route skeleton is structurally sound — Copilot's three fixes verified, drift-check airtight, dynamic import is the documented App Router MDX pattern, 404 test rests on documented `serve-handler` behavior. The one genuinely missing piece is per-halo metadata: a public showcase page with the wrong `<title>` is what gets noticed first when the URL is shared.
