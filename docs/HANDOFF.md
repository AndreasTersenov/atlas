# Atlas — session handoff

**Last refreshed:** 2026-06-10 by the Opus 4.7 session that ran v1.1 → v1.5.
**Next session:** Claude Fable 5, per Andreas. He wants Fable to take the steering wheel — look at everything we've built, refine or rip up the plan, surface its own ideas. This document is the bridge; treat it as the single point of entry, then go deep on the canonical files it points to.

## TL;DR

Atlas is Andreas's personal cosmic-web map. v0 shipped a public showcase; v1.1 → v1.4 shipped Supabase + Auth + per-halo command panels + GitHub integration; v1.5 is **in PR #6, partially smoke-tested, not merged** — a substantial pivot from the original Phase 5 plan (Modal-hosted agent dispatch via API) to a **cross-machine Claude observatory** that tails Claude Code's per-session JSONL transcripts into Supabase so the cockpit can render live what's running on every machine. The pivot was forced by Andreas's actual constraints (Claude Max only, no Anthropic API budget; multi-HPC workflow with parallel `claude` sessions on macbook + titan + rorqual). End-to-end the bridge works on macbook (verified: 25 sessions, ~13K messages in Supabase); the browser-side UX smoke and titan setup are still pending on Andreas's side.

## What Atlas is (one paragraph)

A personal OS for Andreas, expressed as a cosmic-web map. Each halo is a project; filaments are shared methodology, dependencies, and career arcs. Three layers: (1) public showcase at `/` — static, beautiful; (2) private cockpit at `/cockpit` — same map but lit by real activity, click a halo to drill into its command panel; (3) per-halo command panel at `/cockpit/[haloId]` — header + Activity feed (GitHub) + Sessions feed (Claude observatory, new in v1.5) + Notes. The differentiator was originally "agent dispatch surface"; with v1.5 the centre of gravity shifts to "cross-machine session observatory" with agent dispatch as a follow-up. **Andreas explicitly opened the door for Fable to push back on that framing if Fable sees a better shape.**

For the full design spec read `docs/ATLAS_HANDOFF.md` (~600 lines, the original handoff). For the v1 phase plan read `docs/V1_PLAN.md`. For v1.5 specifically (the pivot) read `docs/V1_5_PLAN.md` — that doc records every decision we settled and why.

## What's shipped

| Version | Commit / PR | What |
|---|---|---|
| v0.1.0  | `c1d3da3` | Public cosmic-web map, 18 halos, deployed to atlas-rust-one.vercel.app |
| v1.1    | `e86f88e` (#1) | Supabase schema + JSON→DB seed pipeline |
| v1.2    | `5a0ea8b` (#2) | Magic-link auth + protected /cockpit + full halo set |
| v1.2.1  | `5eb19e4` (#3) | Switched magic-link → email+password (Gmail's link-prefetcher was consuming OTPs) |
| v1.3    | `b89afdd` (#4) | /cockpit/[haloId] command panel skeleton (4 zones, empty states) |
| v1.4    | `1a0138d` (#5) | GitHub PAT integration end-to-end (live feed, configurable repos, halo glow stub) |
| v1.5    | PR #6 **open** | Cross-machine Claude observatory (bridge + Sessions zone + map glow) |

`main` currently sits at `1a0138d` (v1.4). The v1.5 PR is on branch `v1.5-claude-observatory` with 5 commits on top of main:

```
55546a9 chore: package-lock for engines.node>=20.17
36e73ee review: Copilot comments + NUL byte fix found during local smoke
051f054 v1.5: cross-machine Claude observatory
7f10bff chore(db): regenerate database.types.ts after 0002
df5beff v1.5: plan + migration 0002 (claude_sessions, session_messages)
```

## The v1.5 pivot (read this before touching anything)

Original Phase 5 in `docs/V1_PLAN.md` was: deploy a FastAPI function on Modal, call the Anthropic SDK with an API key, stream a response back into the cockpit's Agent zone via SSE. Acceptance criterion was "click button → see Claude streaming."

Two things made that plan wrong:

1. **Andreas only has Claude Max** (a chat subscription), not API credits. The Modal plan needed paid API access. He surfaced this in the conversation immediately before v1.5 started: *"I have a claude code subscription (not an API). Also … I would like to do it for free."*
2. **Andreas's actual workflow is multiple parallel Claude Code sessions in tmux across multiple machines** (macbook + titan + rorqual). What he actually wants is a single pane of glass that shows him what's running where, not a button to dispatch new agents. *"I am doing my work on multiple ssh HPCs, and I have different claude code sessions … so that was the reason why I would like to have it all in one place, and control from there what's going on in all of those."*

These two together replace Phase 5 entirely. The new plan in `docs/V1_5_PLAN.md`:

- A small `scripts/atlas-bridge.ts` runs as a long-lived process on each machine, watching `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` (the per-session transcript Claude Code already writes for you).
- Per-machine `~/.atlas/mapping.json` resolves `cwd` → `halo_id` via glob patterns.
- The bridge upserts a row into the new `claude_sessions` table and appends each JSONL line into `session_messages`. Idempotent on `(session_id, sequence)` so restarts are safe.
- Cockpit panel grows a new **Sessions** zone above the GitHub Activity feed; client component subscribes to Supabase Realtime so transcripts stream live.
- Cosmic-web map's halo glow is driven by per-halo session recency (a session "now" → 1.0 boost fading linearly to 0 over an hour).

**What's not in v1.5:** the write/steer path (sending messages from the cockpit back into a tmux'd Claude session). Deferred to v1.6 per Andreas's call. Three potential approaches sketched in `V1_5_PLAN.md` Section H.

### Resolved decisions for v1.5 (locked in `V1_5_PLAN.md` §L)
- Machines: **macbook + titan** in v1.5; rorqual added later.
- Code lives in **this Atlas repo** (HPCs clone the whole thing).
- Bridge starts via **manual `npm run bridge` in a tmux window**, no auto-start yet.
- Sessions zone sits **above** the GitHub Activity feed.
- HPC for v1.5 is **titan** (interactive, no scheduler; rorqual is SLURM-only).

### v1.5 PR status — what I verified end-to-end vs what's still on Andreas

✓ Migration 0002 applied to live Supabase, types regenerated and committed.
✓ Bridge boots cleanly on macbook, resolves owner via `auth.admin.listUsers`, watches `~/.claude/projects/`.
✓ `~/.atlas/mapping.json` is already created on macbook (I wrote it during smoke testing).
✓ 25 `claude_sessions` rows in live Supabase (2 mapped to `personal-site`, the rest unmapped and harmless).
✓ 12,935 `session_messages` rows inserted across all transcripts.
✓ NUL-byte bug surfaced + fixed (`sanitizeForJsonb` in `lib/atlas-transcript.ts`).
✓ Graceful SIGINT marks sessions `idle` and exits cleanly.
✓ All 8 Copilot review comments on PR #6 addressed.
✓ `npm run build` + `npm run lint` clean.

✗ Andreas hasn't done the browser-side smoke yet (load `/cockpit/personal-site`, expand a session, verify transcript renders, start a fresh `claude`, watch the new prompt appear within 30s, eyeball halo glow on the map).
✗ Titan setup not done (clone, copy `.env.local`, create titan's `mapping.json`, start bridge).
✗ v1.5 PR not merged.

The PR body has Andreas's step-by-step checklist. Don't trust visual claims about it until he confirms — the things I CAN'T verify from a CLI session are exactly the things that need his eyes.

## Live state of the world (as I left it)

- **Live Supabase project**: `https://kypdukvvlykwqspquqqk.supabase.co`, eu-central-1. Migration 0002 is live. `claude_sessions` has 25 rows from macbook; `session_messages` has ~13K rows. All RLS-scoped to Andreas's user `426a4954-0c9c-450c-9633-066837691fe8`.
- **Vercel project**: `atlas` (under `andreastersenovs-projects`). Production URL `https://atlas-rust-one.vercel.app` — **still serving v0**; no v1.x deploy yet because env vars haven't been set in Vercel (per V1_STATUS.md). The cockpit is dev-only at the moment.
- **Macbook**: `~/.atlas/mapping.json` exists, mapping `/Users/atersenov/Software/atlas{,/**}` → `personal-site`. Bridge code is in the repo. No bridge process currently running (I killed it after smoke). To start: `npm run bridge` in a tmux window.
- **Titan**: nothing set up yet.
- **Local dev**: Node 20.10 (still). chokidar pinned to ^3.6 so it works on 20.10 — bumping Node to 20.19+ would unlock chokidar 5 if Andreas wants that later.

## Open questions worth thinking about

Listed in roughly the order I'd weigh them. Fable should feel free to reorder, reject, or add to this list.

1. **Does the observatory framing actually do what Andreas needs?** I assumed it does because Andreas described the multi-HPC pain. But the original Atlas thesis (handoff §1) was "agent-dispatch surface with summaries as supporting infrastructure" — v1.5 inverts that. Worth Fable's read on whether the inversion is the right call or whether dispatch should still anchor things. Andreas explicitly said he's open to ideas: *"really take the steering wheel."*

2. **The write/steer path.** v1.6 is supposed to land this. Three options sketched in `V1_5_PLAN.md` §H (per-pane `tmux send-keys`, a `claude-with-atlas` wrapper, or wait for Anthropic to expose programmatic stdin). Fable might see a cleaner shape — particularly given Fable's recommended **send-to-user tool** pattern (see <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5>) which is the inverse direction but architecturally relevant.

3. **The Agents zone is still a stub.** Under the original plan it would host dispatch buttons. Under the observatory model what does it become? "Recent agent runs" (kind of redundant with Sessions)? "Agent shortcuts that start a new tmux'd Claude session somewhere"? Or just remove the zone? Fable's call.

4. **Halo glow signal is doubled-up.** v1.4 wired halo glow off GitHub commits; v1.5 wired it off session recency. Right now session-recency wins (sessions are a better proxy for "actively worked on"). The GitHub-glow code was never actually live, but the question stands: should activity signals stack, swap, or be user-configurable?

5. **Mapping config is hand-edited per machine.** This will get tedious as halos grow. Auto-detection candidates: git remote URL → project name → halo (brittle but cheap), explicit `.atlas-halo` file in the project root (cleanest), or a one-time CLI like `atlas link <halo-id>` that writes the mapping.

6. **`claude -c` resume semantics.** Open question we never tested. Does resuming a session keep the same UUID (good — appears continuous in the cockpit) or mint a new one (sessions look "split")? Worth verifying empirically before this gets in front of users.

7. **Bridge process management.** Manual tmux launch is fine for v1.5 but a launchd plist (macbook) and `systemd --user` unit (HPCs) is the obvious follow-up. Slightly more invasive on the HPC side.

8. **Sessions zone rendering.** The `extractText` helper in `app/cockpit/[haloId]/sessions-zone.tsx` is a best-effort traversal of Claude Code's JSONL event shapes. It will say `(no preview)` for content types it doesn't recognise. Worth Fable cross-checking against real transcripts after the browser smoke.

9. **Vercel production deploy.** The site has been on v0 since launch. v1+ has never been pushed to prod because env vars haven't been set in Vercel. Worth deciding whether v1.5 (or whatever Fable lands on) is the version that finally promotes to prod.

10. **Naming pollution from the architecture pivot.** Decisions A2, A9, A15 in `V1_PLAN.md` §A.3 are explicitly marked "withdrawn" in `V1_5_PLAN.md` §A, but the original `V1_PLAN.md` still presents them as current. Worth a docs-only pass to reconcile.

## What Andreas explicitly wants from this Fable session

In his own words:

> So I think that fable could look more properly, into everything, modify and refine our plan etc, drop new ideas on how to modify this thing make it better and more useful, and really take the steering wheel on it

Translation:
- Start broad, not narrow. Read the canonical docs. Form a fresh view.
- Don't feel constrained by the current plan; push back where pushback is earned.
- Surface ideas — including ones that change scope or direction.
- Drive the work; don't wait for him to micromanage each step.

He's a sharp collaborator who wants pushback, not deference. Concrete corrections of "this plan is wrong because X" land well. Diplomatic hedging doesn't.

## Reading order (canonical)

Read these in order before doing anything. Spend the time — the project rewards it.

1. **`AGENTS.md`** (one line) — "this is NOT the Next.js you know." Heed the deprecation warnings in `node_modules/next/dist/docs/`; check API shapes against them before writing code.
2. **`docs/HANDOFF.md`** (this file) — the bridge.
3. **`docs/V1_STATUS.md`** — last refreshed 2026-05-17 (a bit stale now; the table below this section is more current).
4. **`docs/V1_PLAN.md`** — settled decisions A1–A15 + operational, phase order, acceptance criteria. A2/A9/A15 are amended by V1_5_PLAN.
5. **`docs/V1_5_PLAN.md`** — the pivoted Phase 5 plan and resolved choices.
6. **`docs/ATLAS_HANDOFF.md`** — original full design spec. §§3 (visual principles), 5 (data model), 8 (layer architecture), 11 (phased plan), 12 (open decisions) are the load-bearing sections.
7. **`README.md`** — local dev setup.
8. **`~/.claude/CLAUDE.md`** + **`~/dotfiles-claude/CLAUDE.md`** — Andreas's working style. Direct, no hedging, prose over lists when reasoning, push back proportionately.
9. **`/Users/atersenov/.claude/projects/-Users-atersenov-Software-atlas/memory/MEMORY.md`** — auto-memory index. Updated with v1.5 entries.

## Things about Andreas worth remembering

- PhD candidate in computational cosmology (Crete + CEA Paris-Saclay), defending in ~3 months (Aug–Sep 2026). UVa CosmicAI postdoc starts Oct 12, 2026.
- Multi-HPC daily driver: titan (interactive workstation, ssh aliased), rorqual (SLURM), macbook. dotfiles-claude synced across all of them.
- Aesthetic: scientific, data-viz literate, prefers thoughtful technical design over generic SaaS polish. Don't dumb anything down.
- Decision style (from memory): prefers simple recommendations; defers technical-detail choices; surface alternatives only when there's real cost-of-being-wrong.
- Working agreement: feature branches → PR → Copilot review → squash-merge with `--delete-branch`. Direct-to-main is reserved for trivial unblockers (WS shim, data dupes, etc.).
- `npm run build` must pass before any commit. Lint warnings on `components/CosmicWebMap/glyphs.ts` (9 pre-existing v0 `'c' unused` warnings) are tolerated.

## Notes specific to Fable

(From <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5>.)

- **Start at the top of your difficulty range.** Atlas at this stage is exactly the shape the doc describes ("hardest unsolved problem the team has"). Don't begin with a warm-up — engage the open questions directly.
- **Adaptive thinking is always on; raw chain of thought is never returned.** Don't ask Fable to echo its reasoning back in user-facing text — that risks tripping the `reasoning_extraction` refusal classifier. Andreas's CLAUDE.md doesn't ask for that.
- **Andreas's CLAUDE.md is rich** — review it, but don't follow every instruction prescriptively if it conflicts with default Fable behaviour. Several of his instructions (no hedging, prose over lists, don't add features beyond what's asked) are literally what the Fable prompting guide already recommends.
- **Audit progress against tool results** before reporting any state. Don't trust prior-session claims (including mine) until verified — `gh pr view 6`, `git status`, real Supabase queries.
- **The send-to-user tool** pattern from the Fable docs is genuinely interesting in this project's context (it's the inverse of the "steer" direction in §H of `V1_5_PLAN.md`). Worth considering.

## If I were the next session, I'd start by

(Not prescriptive — Fable should form its own plan after reading.)

1. Pull main, fetch the v1.5 branch, `gh pr view 6` to see the live PR state.
2. Verify the current Supabase state against my claims — `claude_sessions` count, mapped rows, recent activity.
3. Read the canonical docs in order. Take notes on disagreements / missing pieces.
4. Decide whether v1.5 ships as-is, ships with Fable's revisions, or gets reshaped. Andreas gave explicit permission to reshape.
5. Either ship v1.5 (after Andreas does the browser smoke + titan setup) or open a follow-up PR with the reshape. Either way, communicate the call to Andreas before writing code.

Good luck.
