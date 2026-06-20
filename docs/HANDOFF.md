# Atlas — session handoff

**Last refreshed:** 2026-06-10 by the Fable 5 session (took over from Opus 4.7, audited everything, hardened v1.5, rolled out titan).
**Status:** v1.5 on PR #6, fully verified end-to-end on macbook + titan, awaiting Andreas's "merge" → then production deploy.

## TL;DR

Atlas is Andreas's personal cosmic-web map / project OS. v1.5 pivoted Phase 5
from "Modal-hosted agent dispatch" (dead: Claude Max only, no API budget) to a
**cross-machine Claude observatory**: a per-machine bridge tails Claude Code's
transcript JSONLs into Supabase; the cockpit renders live sessions per halo
with Realtime streaming and session-recency halo glow. As of 2026-06-10 the
observatory is **live on two machines** (macbook via launchd agent
`com.atlas.bridge`, titan via tmux session `atlas-bridge`) and verified
end-to-end including a real-browser Playwright smoke. Remaining: Andreas says
"merge" → squash-merge PR #6 → set Vercel env vars → production deploy.

## Reading order

1. `docs/V1_5_PLAN.md` (on the `v1.5-claude-observatory` branch until merge) —
   the observatory plan; **§N is the hardening log** with every post-plan fix
   and why.
2. `docs/V1_PLAN.md` — v1 decisions A1–A15; A2/A9/A15 marked withdrawn/amended.
3. `docs/ATLAS_HANDOFF.md` — original design spec (visuals §3, data model §5,
   layers §8). The "agent dispatch is the differentiator" framing in §1 is
   superseded: the differentiator is now the observatory; dispatch returns in
   v1.6 as *steering through the bridge*.
4. `README.md` — local dev.

## State of the world (verified 2026-06-10)

- **PR #6** (`v1.5-claude-observatory`): the original 5 commits plus the
  Fable session's hardening: `fd2a618` (polling on Linux, offset tail reads,
  mapped-only ingestion, 4KB string caps, mtime-honest liveness, stable
  `machine` label in mapping.json, conversation-only rendering), `22c4197`
  (Realtime auth bug — channel joined as `anon` before the cookie session
  reached the socket; RLS silently dropped every event; fixed with explicit
  `realtime.setAuth()`), `5ff6d0a` (bounded 512KB tail backfill + byte-offset
  sequence keys, forced by titan's 1.5GB of transcripts), `0e8451a` (four new
  research halos + halo_id re-resolution on re-sighting), plus a transcript
  scroll-cap/docs commit.
- **Supabase** (`kypdukvvlykwqspquqqk`, eu-central-1): migration 0002 live.
  ~1050 `claude_sessions` rows across `macbook` + `titan`; `session_messages`
  holds bounded tails only (~3K rows). All legacy/full-fat message rows were
  wiped with Andreas's authorization — message rows are derived data,
  rebuilt automatically by the bridges.
- **Bridges**: macbook — launchd agent `com.atlas.bridge`
  (`~/Library/LaunchAgents/com.atlas.bridge.plist`, logs to
  `~/.atlas/bridge.log`; `launchctl kickstart -k gui/$UID/com.atlas.bridge`
  to restart). titan — tmux session `atlas-bridge` in `~/atlas`, Node 22 at
  `~/.local/opt/node`, logs to `~/.atlas/bridge.log`. Both on the PR head.
  Mapping files: `~/.atlas/mapping.json` per machine, **must contain
  `"machine": "macbook" | "titan"`** (os.hostname() follows DHCP and forks
  session identity — learned the hard way).
- **Halo data**: 23 halos / 33 filaments after adding `jax-flows`,
  `lss-pdf-emulator`, `wale`, `wl-stats-torch` (Andreas's placement of his
  titan projects; descriptions are placeholders he may reword; glyphs reuse
  existing types).
- **Vercel**: production still serves v0. No env vars set yet. The deploy
  step after merge: set `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`
  (values in `.env.local` / password manager), push or `vercel --prod`.
- **rorqual**: no bridge yet. The titan recipe transfers directly (Node
  tarball → clone → `.env.local` → mapping with `"machine": "rorqual"` →
  bridge under tmux on the login node; stat-polling is already the Linux
  default, which rorqual's NFS/Lustre needs). Blocked only on SSH access
  from wherever the session runs.

## What was verified (don't re-verify, build on it)

End-to-end: tool output → transcript file → bridge → Supabase insert →
Realtime → open browser DOM, in seconds, via authenticated Playwright with
screenshots (auth gate, sessions zone, expanded transcript, live marker
arrival). Bounded backfill on titan: zero errors, ~2.7K rows for 232 mapped
sessions. Resume semantics (old open question): a session = one UUID = one
file even across 18 days and compactions; Andreas never resumes (he
`/clear`s); `--resume` would mint a new file with copied history — accepted.

## Next after merge (v1.6 direction, discussed with Andreas)

The bridge becomes the **actuator**, not just the sensor: a `session_commands`
table; cockpit inserts a row; the right machine's bridge picks it up via
Realtime and acts. Start with *launch* (`tmux new-window 'claude "<prompt>"'`
in a mapped cwd), then *steer* (send-keys into an existing session's pane —
needs a SessionStart hook writing `{sessionId, $TMUX_PANE}` to `~/.atlas/`,
synced via dotfiles-claude). The Agents zone becomes the launcher surface
(`halo_agents` rows = launch templates: machine + cwd + prompt).

Smaller follow-ups worth picking up: unmapped-sessions surface in the cockpit
("N unmapped sessions on titan — update your mapping"); per-halo session count
badge on the map; HPC key hygiene (narrow ingest endpoint with a bridge token
instead of the service-role key in cluster home dirs); subagent transcript
visibility (`<session>/subagents/*.jsonl`, currently excluded by `depth: 2`).

## Working agreement (unchanged)

Feature branches → PR → Copilot review → squash-merge `--delete-branch`.
`npm run build` must pass before any commit. The 9 `glyphs.ts` lint warnings
are tolerated. Audit any prior session's claims against tool results before
repeating them.
