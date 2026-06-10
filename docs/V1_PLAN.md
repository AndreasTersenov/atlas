# Atlas v1 — Implementation Plan

**Status:** ✅ Decisions locked 2026-05-17. Ready to begin Phase 1.
**Author:** Claude Opus 4.7 (1M context), under Andreas Tersenov's direction.
**Date:** 2026-05-17.
**Spec source:** `docs/ATLAS_HANDOFF.md` §§3–12, plus v0 lessons in §11.
**Goal (handoff §11):** add auth, the private cockpit, and prove end-to-end that one tool integration (GitHub) and one agent dispatch (Claude on-demand) work.

This plan documents the decisions Andreas settled on 2026-05-17 and the build order. After approval to begin Phase 1, we open scoped PRs per phase.

---

## A. Decisions to settle before coding

The handoff left several decisions open or recommended-but-not-confirmed. v1 forces all of them. Each decision below is tagged **DECIDE** with a recommendation Andreas can accept or reject. Where the recommendation contradicts the handoff, I flag it explicitly.

### A.1 — Carried over from handoff §12

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **A1** | **Auth: Clerk vs Supabase Auth** (§12.2) | **Supabase Auth**. *Overrides handoff's "Clerk" default.* | Single vendor for auth+DB. Free up to 50K MAU vs Clerk's 10K. No webhook sync needed (auth.users is already a Postgres table). For ≤5 users the operational savings dominate Clerk's nicer UI. |
| **A2** | **Agent runtime: Modal vs Railway** (§12.3) | **Modal**. | v1 dispatches an on-demand agent that runs for ~30s when invoked, idle otherwise. Modal's per-second billing is essentially free at this scale; Railway is $5-10/mo minimum for an always-on Python container. Modal's `@modal.web_endpoint` exposes FastAPI without extra networking config. |
| **A3** | **Production domain** (§12.1) | **Stay on the Vercel-generated `atlas-rust-one.vercel.app`** for v1. Custom domain deferred — Andreas opted to skip the ~$12/yr cost; the domain decision is fully reversible (nothing in code depends on it). | Decision changed during prereq walkthrough 2026-05-17: originally `atlas.tersenov.dev` but Andreas decided not to register a domain yet. |
| **A4** | **Anthropic STEM fellowship halo in cockpit** (§12.6 re-opens) | Render it **dormant** (faint, no haze, no integrations, no agents) in the cockpit only — still hidden on public. | Keeps the goal visible to Andreas without exposing it externally. Flip to `active` when applied. |
| **A5** | **Personal-private cluster expansion** (§12.4 re-opens) | Keep as **single placeholder halo for v1**. Cockpit click shows a "Private cluster — content TBD" panel. Sub-map is a v2+ decision. | Out of v1 scope; defer. |

### A.2 — New for v1

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **A6** | **Public-layer data source: keep JSON or migrate to Supabase** | **Public stays on `data/halos.json`. Cockpit reads from Supabase.** | Public page is fully static (zero runtime cost, no DB dependency, can't break if Supabase is down). Halo data is tiny and structural — JSON-in-git is the right place. Activity overlays (commits, calendar, tasks) only live in Supabase. |
| **A7** | **Schema migration tooling** | **Supabase CLI migrations** — plain SQL files in `supabase/migrations/`. No ORM. | Schema in §5 is simple. ORM would be overhead. Add Drizzle later if query complexity rises. |
| **A8** | **DB query layer** | **`@supabase/supabase-js` with generated TypeScript types.** `supabase gen types typescript --linked > lib/database.types.ts`. | Plays well with Supabase Auth RLS. No ORM lock-in. Auto-generated types catch schema drift. |
| **A9** | **Agent dispatch streaming protocol** | **SSE (Server-Sent Events).** Modal `@modal.web_endpoint` returns a streaming response; Next.js `/api/agents/dispatch` proxies the SSE to the browser; browser uses `EventSource` (or `fetch` + `ReadableStream`). | Anthropic SDK has a `stream=True` API that yields SSE naturally. Two-hop (browser → Vercel → Modal) keeps Modal URL off the client. |
| **A10** | **RLS policy strategy** | `halos` and `filaments` tables: **public read, no RLS** (same rows for everyone). Per-user tables (`halo_integrations`, `halo_agents`, `agent_runs`, `user_settings`, notes): **`owner_id` column referencing `auth.users(id)` + RLS policy `auth.uid() = owner_id`**. | Halos are structural — same for every user. User-state and OAuth tokens are per-user. Adding `owner_id` upfront avoids a painful migration when v2 adds collaborators. |
| **A11** | **Cockpit map fidelity vs public map** | **Identical render, full halo set.** No activity-driven brightness in v1 (that's a v2 deliverable). | Reduces v1 surface area. Activity overlays need integrations on every halo, not just thesis — premature. |
| **A12** | **Halo command-panel content scope per halo** | All halos get the **panel skeleton** (four zones, empty states). Only **thesis** has GitHub + agent wired end-to-end. Other halos show "No integrations configured" / "No agents available". | Per acceptance criterion: thesis is the proof. Skeleton-for-all means every click is functional, not a 404. |
| **A13** | **Notes/log storage in v1** | **localStorage**, scoped by halo id. Migrate to Supabase `halo_notes` table in v2. | Avoids a per-halo CRUD endpoint in v1. Trades multi-device sync for shipping speed. Document the limitation. |
| **A14** | **Halo click on public layer** | **Defer `/p/[halo-id]` to v2.** Public click stays as `console.log` (current v0 behaviour). | §11 v1 deliverables list `/cockpit/[halo-id]` but not `/p/[halo-id]`. Public detail pages need a content schema (decision #11) and shouldn't block v1. |
| **A15** | **Modal app structure** | One Modal app (`atlas-agents`), one function (`dispatch`) for v1. Add `monitor` and `workflow` as separate functions in v2/v3. | Matches §10 mode-A scope. Keeps deploy unit small. |

### A.3 — Resolutions (2026-05-17)

| # | Decision | Choice | Notes |
|---|---|---|---|
| A1 | Auth | **Supabase Auth** | Single vendor, magic-link, allow-listed email only |
| A2 | Agent runtime | ~~Modal~~ **WITHDRAWN by V1_5_PLAN §A** — no remote runtime; "agents" are the Claude Code sessions Andreas already runs on his machines | Andreas has Claude Max only (no API budget); Modal plan needed paid API access |
| A3 | Production domain | **`atlas-rust-one.vercel.app`** for v1 (custom domain deferred — Andreas opted to skip the ~$12/yr cost; nothing in code depends on the domain, can swap anytime) | |
| A4 | Anthropic halo | **Dormant in cockpit, hidden public** | (Recommendation accepted, no override.) |
| A5 | Personal-private | **Single placeholder for v1** | Sub-map deferred — content design TBD by Andreas |
| A6 | Public data source | **`data/halos.json`** | Cockpit reads Supabase separately |
| A7 | Schema migrations | **Supabase CLI SQL files** | No ORM. Drizzle considered for v2+ if queries get complex |
| A8 | DB query layer | **`@supabase/supabase-js` + generated types** | `supabase gen types typescript` |
| A9 | Streaming protocol | ~~SSE~~ **AMENDED by V1_5_PLAN §A** — Supabase Realtime row changes; bridge inserts rows, cockpit subscribes | No Modal endpoint to stream from |
| A10 | RLS shape | **`owner_id` upfront + strict RLS** | `auth.uid() = owner_id` on every per-user table |
| A11 | Cockpit map fidelity | **Identical to public, full halo set** | Activity-driven brightness lives in v1.6 (see B) |
| A12 | Panel scope per halo | **Skeleton for all, thesis wired E2E** | Empty states elsewhere |
| A13 | Notes storage | **localStorage in v1**, Supabase later | Single-user, single-device acceptable |
| A14 | `/p/[halo-id]` | **Deferred to v2** | Public click stays as `console.log` |
| A15 | Modal app structure | ~~One app, one `dispatch` function~~ **WITHDRAWN by V1_5_PLAN §A** — no Modal in v1 | See A2 |

### Operational decisions

| Decision | Choice |
|---|---|
| Sign-in allow-list | **`andrewtersenov@gmail.com` only** — implemented as Supabase Auth hook / DB trigger that rejects non-allow-listed sign-ups |
| Integration for v1.4 | **GitHub (personal access token)** — swapped from Todoist (Todoist developer console was harder to navigate; GitHub PAT is a 2-minute setup with no OAuth flow). The integration architecture is identical either way; we're just validating the pattern with a simpler tool. |
| Scope additions pulled into v1 | **Activity-driven brightness** as new phase v1.6 (after v1.5) — Thesis-only since it's the one halo with integration data |
| Scope additions kept deferred | Sub-map for personal-private (needs content design), `/p/[halo-id]` (v2), notes-in-Supabase (v2) |

---

## B. Build order

User's proposed sequence is sound. Below is the same skeleton with explicit "shippable as" markers per phase so each lands independently. Estimated effort: solo developer time, optimistic.

### Phase 1 — Supabase project + schema + JSON migration
**Time:** ~1 day. **Shippable as: v1.1.** ✅ **SHIPPED 2026-05-17** (commit `e86f88e`, PR #1)

1. Create Supabase project (`atlas-prod` org-or-personal). Note the URL, anon key, service role key.
2. `supabase/migrations/0001_initial.sql`: tables from §5 + the `owner_id` additions from A10. Apply via `supabase db push`.
3. `supabase/seed.ts`: parses `data/halos.json` + `data/filaments.json`, upserts on `id` (idempotent). `--prune` flag removes orphans.
4. `npm run db:seed` runs the seed script against `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.
5. Generate TS types: `supabase gen types typescript --linked > lib/database.types.ts`. Commit.
6. Smoke test (unauthenticated): build a throwaway `/cockpit-preview` route that fetches halos from Supabase and reuses `<CosmicWebMap>`. Verify it renders the same map as `/`.
7. Tear down `/cockpit-preview` before merging.

**Done = Supabase contains halos+filaments matching JSON; smoke test confirmed parity; types generated.**

### Phase 2 — Supabase Auth + protected cockpit shell
**Time:** ~1 day. **Shippable as: v1.2.** ✅ **SHIPPED 2026-05-17** (commit `5a0ea8b`, PR #2)

**Plus follow-up v1.2.1** (commit `5eb19e4`, PR #3): magic-link OTP was hitting Gmail's link-prefetcher (which consumes the one-time code before the user clicks). Switched to email + password sign-in via the same form. Initial user created via Supabase dashboard's admin "Add user" since the "Confirm email" toggle wasn't visible in Andreas's project UI.

1. Add `@supabase/auth-helpers-nextjs` (or `@supabase/ssr` — newer pattern).
2. `app/sign-in/page.tsx`: magic-link form (email → click link → land on `/cockpit`).
3. `middleware.ts`: redirects unauthenticated `GET /cockpit/*` to `/sign-in`.
4. `app/cockpit/page.tsx`: renders the cosmic web map for all halos (data fetched server-side from Supabase). Includes a sign-out button in the corner.
5. Sign Andreas up as the first user (via magic-link, allow-listed email).

**Done = visit `/cockpit` while signed out → redirects to `/sign-in`. Sign in → land on cockpit map. Sign out → redirect back to `/`. All 19 halos (including dormant Anthropic) visible.**

### Phase 3 — `/cockpit/[halo-id]` command panel skeleton
**Time:** ~1.5 days. **Shippable as: v1.3.**

1. Route: `app/cockpit/[haloId]/page.tsx`. Server-side: validate halo exists, fetch halo + integration + agent rows for current user.
2. Layout: four zones from §8 Layer 3.
   - **Header**: name, domain, status, last-activity placeholder, "Open in …" stubbed links.
   - **Activity feed**: empty state ("No integrations configured. [Add one]").
   - **Agent strip**: empty state ("No agents available. [Browse]").
   - **Notes**: a markdown textarea persisted to localStorage keyed on halo id (per A13).
3. Wire the public map's `console.log` click to `router.push("/cockpit/[id]")` when on the cockpit map. (Public map stays unchanged.)
4. Add a "back to map" link in the panel header.

**Done = click any halo on cockpit → land on its panel. Notes persist across reloads. All zones render even when empty.**

### Phase 4 — GitHub (PAT) integration end-to-end on thesis
**Time:** ~1.5 days (cheaper than Todoist OAuth would have been). **Shippable as: v1.4.**

1. Andreas creates a GitHub Personal Access Token (classic, `repo` scope) — see Prereq 4. Paste into `.env.local` and Vercel env as `GITHUB_PAT`.
2. Schema: no `oauth_tokens` table needed for v1 (PAT-only). `halo_integrations.config` stores the repo list: `{ provider: "github", config: { repos: ["owner/repo1", "owner/repo2"] } }`.
3. Config UI in the agent strip: "Add GitHub integration" → `GET /api/integrations/github/repos` (server fetches the PAT-holder's repos), renders a multi-select, "Save" inserts a `halo_integrations` row.
4. Activity feed loader (server component): if `halo_integrations` row exists for `github`, server fetches recent commits / open PRs / open issues across the configured repos via the GitHub REST API. Render as a unified time-sorted list, each item linking to its GitHub URL.
5. Manual setup: configure the Thesis halo with the relevant research repos (e.g. `atersenov/bnt-cnn`, `atersenov/jax-mass-mapping`).

**Done = open `/cockpit/thesis`, see recent commits/PRs/issues from your research repos. Click any item → opens in GitHub.**

**Note on switching back to OAuth later**: a PAT is fine for a single-user system. If Atlas ever has collaborators (v2+), we add an `oauth_tokens` table and a GitHub OAuth flow so each user uses their own credentials. Until then, PAT keeps Phase 4 simple.

### Phase 5 — Modal + FastAPI + first on-demand agent for thesis
**Time:** ~2.5 days. **Shippable as: v1.5.**

> **SUPERSEDED (2026-05-23):** this phase was replaced wholesale by the
> cross-machine Claude observatory in [`V1_5_PLAN.md`](./V1_5_PLAN.md) —
> Andreas has Claude Max only (no Anthropic API budget), and his actual
> need was visibility over the parallel Claude Code sessions he already
> runs on macbook + the HPCs, not a dispatch button. Kept for the record;
> do not build.

1. Sign up for Modal. `modal token new` locally.
2. Create `modal/atlas_agents.py`:
   ```python
   @app.function(secrets=[modal.Secret.from_name("atlas-prod")])
   @modal.web_endpoint(method="POST")
   def dispatch(req: DispatchRequest):
       # 1. Load agent row from Supabase by agent_id
       # 2. Load halo's recent integration data (last 24h commits / open PRs / open issues from configured GitHub repos)
       # 3. Build the prompt: agent.context_md + integration_summary + req.input
       # 4. Call Anthropic SDK with model="claude-opus-4-7", stream=True
       # 5. Yield SSE chunks; on done, write agent_runs row
   ```
3. Seed a single `halo_agents` row for thesis:
   - `name`: "Draft email reply"
   - `context_md`: a short preamble describing the thesis context (weak lensing, advisors, current chapters)
   - `kind`: "on_demand"
4. `app/api/agents/dispatch/route.ts`: proxies SSE from `MODAL_AGENT_URL` to the browser. Verifies user is authenticated before forwarding.
5. Frontend: "Draft email reply" button in the agent strip on `/cockpit/thesis`. Click opens a side panel; subscribe to the SSE stream; render incrementally. On stream end, refresh the "Run history" list (from `agent_runs`).
6. Manual end-to-end test: click button, watch a streamed response that references thesis context.

**Done = the F acceptance criterion below passes.**

### Phase 6 — Activity-driven brightness on the cockpit map (Thesis-only in v1)
**Time:** ~1 day. **Shippable as: v1.6 (= v1 final).**

1. Add `lib/activity.ts`: given a halo id + user id, query the integrations layer (GitHub for now) and return an "activity score" derived from commit count + open-PR count + open-issue count in the last N days. Normalised to `[0, 1]`.
2. Extend `CosmicWebMap` to accept an optional `activityByHaloId: Record<string, number>` prop. When present, the halo's haze alpha and core brightness multiplier are scaled by `(0.7 + 0.3 * activity)` — flat halos stay readable, active halos pulse brighter.
3. `/cockpit/page.tsx` fetches activity scores server-side for every halo with an integration row (in v1: just Thesis) and passes them in. Halos without integration rows render flat (current v0 behaviour).
4. Document in `docs/ATLAS_HANDOFF.md` §8 Layer 2 that v1.6 only lights up halos with at-least-one integration; v2 lights up the rest as integrations land.

**Done = Thesis halo visibly pulses brighter on the cockpit map when there's recent GitHub activity (commits, open PRs, open issues); brightness fades back when activity dies down. All other halos render at flat v0-equivalent intensity.**

### Push-back / order tweaks
- User suggested order is fine. The only swap I'd consider is doing Phase 3 (panel skeleton) before Phase 2 (auth), so the panel design is locked before being gated. But the panel needs `currentUser` to scope `halo_integrations` rows, and adding auth first means we never have to retrofit user-scoping. **Keeping user's order.**
- Phase 4 (GitHub) and Phase 5 (Modal) could technically be done in parallel after Phase 3, but the agent in Phase 5 needs the GitHub tasks as context — so 4 → 5 is the right linearisation.

---

## C. Environment & secrets

Three locations. Nothing secret in the repo.

### `.env.local` (gitignored, local dev only)

```
NEXT_PUBLIC_SUPABASE_URL=https://kypdukvvlykwqspquqqk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # server-only — never NEXT_PUBLIC
GITHUB_PAT=ghp_...                      # personal access token, classic, `repo` scope
MODAL_AGENT_URL=https://<workspace>--atlas-agents-dispatch.modal.run
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Commit a `.env.example` with placeholder values + a one-line comment per var.

### Vercel project env (`vercel env add <var> production`)

Mirror the above with production values:
- `NEXT_PUBLIC_SITE_URL=https://atlas-rust-one.vercel.app`
- `MODAL_AGENT_URL` pointing at the production Modal endpoint.
- `GITHUB_PAT` is the same value in dev and prod (single-user, single token).

### Modal secrets (`modal secret create atlas-prod`)

Modal functions don't read from Vercel's env — they need their own secret bundle:
- `ANTHROPIC_API_KEY` — for the Claude API
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — Modal writes `agent_runs` rows

### Repo conventions

- `.gitignore` already covers `.env*` and `.vercel/`. No change needed.
- New `.env.example` lists every var with a one-line description; safe to commit.
- README gets a "Local development" section pointing at `.env.example`.

---

## D. Database migration strategy

### Source of truth: `data/halos.json` and `data/filaments.json`

JSON wins because:
- Halo structure (positions, glyphs, domains, public flag) is small and changes via PR — version control fits.
- Public page reads JSON at build time → zero DB dependency for SSG.
- Single workflow: edit JSON → commit → re-seed Supabase.

DB-only data (no JSON counterpart):
- `halo_integrations` — per-user provider configs (`{ provider, config }` rows)
- `halo_agents` — preconfigured agents (some seeded, some user-created)
- `agent_runs` — dispatch history
- `user_settings` — per-user preferences

(No `oauth_tokens` table in v1 since GitHub uses a PAT. The table arrives in v2 when we add OAuth-based integrations like Gmail or Slack.)

### Seed script (`scripts/seed.ts`)

Behaviour:
1. Read `data/halos.json` and `data/filaments.json`.
2. Validate via zod schema (same schema used at runtime in `lib/halo-schema.ts`).
3. For each halo: `INSERT … ON CONFLICT (id) DO UPDATE SET …` — idempotent.
4. For filaments: same pattern with `(from_halo_id, to_halo_id)` composite key (add a unique constraint).
5. Optional `--prune`: delete halos/filaments whose ids are no longer in JSON. Default off (paranoid).
6. Run via `npm run db:seed`. Uses `SUPABASE_SERVICE_ROLE_KEY`.

### Schema migrations

`supabase/migrations/` — SQL files, numbered:
- `0001_initial.sql` — every table from §5 with the `owner_id` additions from A10.
- `0002_halo_agents_seed.sql` — Phase 5 seeds the thesis "Draft email reply" agent row.

Apply via `supabase db push` (uses `SUPABASE_DB_URL` from `supabase/config.toml`).

Migrations are checked into git. Never edit a previously-applied migration — always add a new one.

### Future re-think trigger

If Andreas wants drag-and-drop halo repositioning in the cockpit, Supabase becomes the source and JSON becomes a one-time bootstrap snapshot. v1 explicitly does **not** support that.

---

## E. Testing approach

Pragmatic minimum that catches the most likely v1 regressions. Stack: Vitest + Playwright + Supabase local.

### Unit (Vitest, `*.test.ts` next to the file)

| File | What it tests | Catches |
|---|---|---|
| `lib/halo-schema.test.ts` | zod parser accepts the current `data/halos.json` and rejects deliberately-malformed fixtures | Schema drift from JSON edits |
| `lib/filaments.test.ts` | every `from_halo_id` / `to_halo_id` in `filaments.json` resolves to a halo in `halos.json` | Typo'd halo ids |
| `lib/github.test.ts` | GitHub commits/PRs/issues response fixtures → parsed activity-feed shape | API contract changes; null fields; pagination edge cases |
| `lib/agent-prompt.test.ts` | Given a halo + integration data fixture, the assembled prompt contains the expected substrings | Prompt regression when refactoring |
| `scripts/seed.test.ts` | Given a halos.json fixture and a mock Supabase client, the upsert calls match expected shape | Seed script regression |

### Integration (Vitest + local Supabase via `supabase start`)

| Test | What it verifies |
|---|---|
| `tests/db.test.ts` | Seed script populates `halos`; reads return same data |
| `tests/rls.test.ts` | Unauthenticated client gets denied reads on `halo_integrations`; authenticated client can read only its own rows |

### E2E (Playwright, one smoke test)

`tests/e2e/smoke.spec.ts`:
1. Visit `/` → page renders, contains `aria-label="Atlas — a personal cosmic web of projects"`.
2. Visit `/cockpit` → redirected to `/sign-in`.
3. (Skipping live sign-in: would require magic-link mailbox stub. Add later with a Supabase test user + password auth toggled on for the test env.)

Run on CI for every PR. Run against a preview Vercel URL.

### Manual sanity check before each deploy

`docs/V1_CHECKLIST.md` (added in Phase 1):
- [ ] Cockpit map renders with all 19 halos
- [ ] Click thesis halo → panel loads
- [ ] Activity feed shows current GitHub activity (recent commits / open PRs / open issues)
- [ ] Click "Draft email reply" → response streams in
- [ ] Sign out → cockpit redirects to sign-in

### Intentionally not tested

- Visual regression on the canvas (brittle; halo positions are fixed and reviewed by eye)
- Anthropic API responses (LLM output is non-deterministic; test the plumbing, not the content)
- Modal cold-start performance (acceptable variance; monitor manually)

---

## F. Acceptance criterion

Adapted from handoff §11 v1 (original spec said "Todoist tasks"; we substituted GitHub activity per the operational decision above):

> Andreas can sign in, open the thesis halo, see recent activity from his configured GitHub repos for that project, and dispatch a "draft email" agent that returns useful output preloaded with thesis context.

Decomposed into a binary checklist (every item must pass):

1. Visit `https://atlas-rust-one.vercel.app` while signed out → public map renders.
2. Click "Sign in" (or visit `/cockpit`) → land on `/sign-in`.
3. Enter Andreas's allow-listed email → receive magic link → click → land on `/cockpit`.
4. `/cockpit` renders the full halo set (19 halos including dormant Anthropic).
5. Click the Thesis halo → navigate to `/cockpit/thesis`.
6. Panel renders with header (Thesis · research · `active` · last-activity timestamp) and four zones.
7. Activity feed shows ≥1 live item (commit / PR / issue) from the configured GitHub repos for the thesis halo.
8. Agent strip shows "Draft email reply" button (the seeded `halo_agents` row).
9. Click button → side panel opens → Claude Opus 4.7 streams a response that mentions the thesis-specific context (e.g. weak lensing, BNT-CNN, advisors).
10. Response completes → "Run history" list shows this run as `completed` (`agent_runs` row inserted).
11. Click "Sign out" → land back on `/` and `/cockpit` redirects again.

**v1 ships when all 11 pass for Andreas's real account against the production Vercel + Modal + Supabase stack.**

---

## Status

All decisions resolved 2026-05-17. **Phases 1 + 2 + 2.1 shipped.** Next up: Phase 3 (`/cockpit/[halo-id]` panel skeleton).

See [`docs/V1_STATUS.md`](./V1_STATUS.md) for the live state (what's deployed where, known gotchas, deferred items).

### Prerequisites before coding starts (running checklist)

- [x] Supabase project created (`https://kypdukvvlykwqspquqqk.supabase.co`) — anon + service_role keys saved in password manager
- [x] Modal account created
- [ ] Andreas creates a GitHub Personal Access Token (classic, `repo` scope) — see Prereq 4. Saves `ghp_…` in password manager.
- [x] Domain decision: stay on `atlas-rust-one.vercel.app` for v1 (no DNS work; custom domain deferred per cost preference)

### Personal-private sub-map (deferred)

Sub-map UI is deferred until Andreas designs the content for the personal-private cluster. When ready, he sends a halo list (ids, names, glyph types, public-vs-locked-by-policy flags) and we add it as a v1.7 phase.
