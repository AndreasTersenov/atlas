# Atlas — v1 Build Status

**Snapshot date:** 2026-05-17 (after v1.2.1 merge)
**Branch:** `main` (clean)
**For:** any future session (Claude or Andreas) picking up v1 work.

## TL;DR

Atlas is a personal cosmic-web map. v0 (public map) shipped + deployed to Vercel. v1.1, v1.2, v1.2.1 (Supabase schema, password auth, protected `/cockpit` showing all 19 halos) shipped to `main` and **working in local dev only** — production Vercel still serves v0. Next concrete step is **v1.3 — `/cockpit/[halo-id]` per-halo command-panel skeleton**.

## Shipped

| Version | Squash commit | What |
|---|---|---|
| v0.1.0  | `c1d3da3` | Public cosmic-web map (Canvas renderer, 18 halos, deployed to atlas-rust-one.vercel.app) |
| v1.1    | `e86f88e` | Supabase schema + JSON→DB seed pipeline (PR #1) |
| v1.2    | `5a0ea8b` | Magic-link auth + protected `/cockpit` + full halo set (PR #2) |
| v1.2.1  | `5eb19e4` | Switched magic-link → email+password (PR #3) |

Fixes on `main` between phases:
- `2f8af5f` — WebSocket shim for `@supabase/supabase-js` on Node < 22
- `78280c0` — removed duplicate filament that broke v1 upsert + added `validateUniqueFilaments`
- `dd516ea` — generated `lib/database.types.ts` from live schema

## What's running where

### Supabase project
- URL: `https://kypdukvvlykwqspquqqk.supabase.co`
- Region: eu-central-1 (Frankfurt)
- Migration `0001_initial.sql` applied (all tables, RLS, allow-list trigger)
- `halos` seeded (19 rows from `data/halos.json`)
- `filaments` seeded (29 rows from `data/filaments.json`)
- One user in `auth.users`: `andrewtersenov@gmail.com` — created via dashboard **Authentication → Users → Add user** (auto-confirmed; password in Andreas's password manager)
- `allowed_emails` table contains the same email; trigger rejects sign-ups for anything else

### Vercel project
- Name: `atlas` (under `andreastersenovs-projects` team)
- Production URL: `https://atlas-rust-one.vercel.app`
- **Currently serving v0** — `main` has v1.x but no deploy has been triggered since v0
- No env vars set in Vercel yet. To deploy v1.2+ to prod, set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Then either push a new commit (auto-deploy) or `vercel --prod`

### Modal
- Account created during v1 prereqs; nothing deployed yet (waiting for Phase 5)

### Local dev
- Node `20.10.0` (`engines.node: ">=20.17"` is a soft warning; works fine with the `ws` shim)
- Supabase CLI `2.98.2`
- `.env.local` populated with real Supabase URL + anon key + service-role key (gitignored, never committed)
- `npm run dev` runs on port 3000 (also tested on 3001 — works either way as long as the chosen port's `/auth/callback` is in Supabase Redirect URLs)
- Sign-in via the form lands on `/cockpit` showing all 19 halos including faint-dashed dormant Anthropic + locked personal-private

## Known gotchas — don't re-discover

These cost us hours during v1. Document so the next session skips them.

1. **Node < 22 + `@supabase/supabase-js`**: the SDK unconditionally instantiates a Realtime client that needs native WebSocket. Node 20.10 doesn't have it. **Fix:** install `ws`, wrap `createClient` in `lib/supabase-admin.ts` / `lib/supabase-server.ts` with `realtime: { transport: WebSocket }`. Vercel prod (Node 22+) is a no-op.

2. **Next.js 16 renamed `middleware.ts` → `proxy.ts`**, function `middleware` → `proxy`. Caught at build time with a clear deprecation warning. `proxy.ts` lives at repo root, same conventions as middleware otherwise.

3. **`useSearchParams` needs a `<Suspense>` boundary** in client components (CSR bailout). Caught at build time. See `app/sign-in/page.tsx` for the pattern: page wraps form in `<Suspense fallback={<Shell />}>`.

4. **Gmail prefetches magic links** to scan them, which consumes single-use OTP codes before the user clicks. This is **why v1.2.1 exists** — we switched to email+password to dodge it. If anyone reintroduces magic-link auth, expect this.

5. **Supabase "Confirm email" toggle**: not visible in Andreas's project (mid-2025+ UI restructure). We worked around it by using the dashboard's admin "Add user" → auto-confirmed flow. If a future session needs a self-serve sign-up path, options are (a) find the toggle in some other location of the new UI, (b) build a server-side admin-auto-confirm wrapper, (c) keep the current workflow.

6. **`data/filaments.json` had a duplicate row** silently rendered twice by v0. v1's `unique (from_halo_id, to_halo_id, kind)` constraint surfaced it. `lib/halo-schema.ts` now exports `validateUniqueFilaments` to catch future ones at the JSON-validate step instead of at upsert time.

7. **zod `.optional()` doesn't accept `null`** — Postgres returns NULL for nullable columns, which JS sees as `null`, which fails zod parse. Use `.nullish()` for any optional field that's also nullable in the DB. Currently applied to `Halo.description_long`, `Filament.description`, `Filament.via_junction`.

8. **`.env.example` was hidden by `.gitignore`'s `.env*` pattern**. Fixed with `!.env.example` negation. Repeat this for any future `.env.foo.example`.

## Deferred / open

| Item | Why deferred | When to revisit |
|---|---|---|
| Production deploy of v1.2+ | Needs Vercel env vars set + a push | When Andreas wants v1 reachable from atlas-rust-one.vercel.app |
| Custom domain `atlas.tersenov.dev` | Andreas opted out of the $12/yr cost | If Atlas ever needs a polished URL |
| Supabase "Confirm email" toggle | Not found in dashboard | Only if we want a self-serve sign-up flow |
| Allow-list error message regex `/allow-list/i` | Might miss Supabase's wrapped error text | When someone tries to sign up with a non-allow-listed email and gets an ugly error |
| Personal-private sub-map | Needs content design from Andreas | When he sends the halo list |
| `/p/[halo-id]` public detail pages | V1_PLAN deferred to v2 | v2 |
| Notes-in-Supabase (currently localStorage) | V1_PLAN A13 deferred to v2 | v2 |
| `lib/database.types.ts` re-generation discipline | Manual — no CI hook yet | If we add CI |
| Tests (vitest + Playwright per V1_PLAN E) | Skipped during phases 1-2.1 | Probably worth wiring before v1.6 |

## Next: v1.3 — `/cockpit/[halo-id]` command panel skeleton

Full spec in [V1_PLAN.md Phase 3](./V1_PLAN.md). Summary:

**Build**:
1. Route `app/cockpit/[haloId]/page.tsx`. Server component, validates halo id exists (else `notFound()`), fetches halo + `halo_integrations` + `halo_agents` for current user.
2. Four-zone layout per ATLAS_HANDOFF §8 Layer 3:
   - **Header**: name, status, domain, last-activity placeholder, stubbed "Open in …" links
   - **Activity feed**: empty state — *"No integrations configured. [Add one]"*
   - **Agent strip**: empty state — *"No agents available. [Browse]"*
   - **Notes**: markdown textarea, persists to `localStorage` keyed on halo id (per V1_PLAN A13). Migrate to Supabase in v2.
3. Wire cockpit-map halo clicks → `router.push("/cockpit/[id]")` (currently `console.log`). Public-map clicks stay as `console.log`.
4. Back-to-map link in the panel header (or breadcrumb).

**Done when**: click any halo on cockpit → its panel loads at `/cockpit/[id]`. Notes persist across reloads. All four zones render with empty states.

**Estimated time**: ~1.5 days.

**No new prereqs from Andreas** — everything runs against the existing Supabase project + local `.env.local`.

## Authoritative docs (read order for a fresh session)

1. **`docs/V1_STATUS.md`** (this file) — current snapshot
2. **`docs/V1_PLAN.md`** — settled decisions (A1-A15 + operational), phase order, acceptance
3. **`docs/ATLAS_HANDOFF.md`** — full design spec. §3 visual principles, §5 data model, §8 layer architecture, §11 phased plan, §12 open decisions
4. **`README.md`** — local dev setup, tech stack, project layout
5. **`CLAUDE.md` / `AGENTS.md`** — "This is NOT the Next.js you know" reminder + project-level conventions

## How to start a fresh session

If a new Claude session is opened and Andreas says "continue v1":

1. Read `docs/V1_STATUS.md` (this file) — full state
2. Read `docs/V1_PLAN.md` — settled decisions you should NOT relitigate (especially A1-A15)
3. `git log --oneline -10` — verify nothing unexpected since this snapshot
4. `git status` — verify `main` is clean
5. If running locally: `npm run dev` (expects `.env.local` populated)
6. Open relevant files for the active phase (see "Next" above)
7. Proceed
