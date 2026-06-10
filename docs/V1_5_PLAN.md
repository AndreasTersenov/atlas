# Atlas v1.5 — Cross-machine Claude observatory

**Status:** draft, awaiting Andreas's sign-off (2026-05-23).
**Supersedes:** V1_PLAN.md §B Phase 5 (the Modal-based on-demand-agent plan), in light of:
1. Subscription-only budget (no Anthropic API access).
2. Andreas's actual workflow: multiple parallel Claude Code sessions in tmux across macbook / titan / rorqual.

V1_PLAN §A.3 decisions A2, A9, A15 are amended; new decisions A16–A19 added. See §A below.

## Goal

Turn `/cockpit` into a live view of every Claude Code session running across Andreas's machines, grouped by halo. The phone `/remote-control` experience as the north star — see the whole transcript, know what's active where — minus the steer/write path (deferred to v1.6).

This replaces the "click button → dispatch new agent" Phase 5 goal with "open Atlas → see what Claude is actually doing for me right now, everywhere."

## A. Decision amendments

| # | Original (V1_PLAN A.3) | Amended |
|---|------------------------|---------|
| A2  | Modal serverless for agent runtime | **Withdrawn.** No remote runtime in v1; agents = the Claude sessions Andreas already runs locally / on HPCs |
| A9  | SSE Modal → Vercel → browser for streaming | **Supabase Realtime row updates.** Bridge inserts `session_messages` rows; cockpit subscribes via Realtime; renders incrementally |
| A15 | One Modal app, `dispatch` function | **Withdrawn.** No Modal in v1 |

### New decisions

| # | Decision | Choice |
|---|----------|--------|
| A16 | Session data source | **Claude Code's transcript JSONL files** under `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. Not tmux pane scraping (ANSI-coded, fragile). Claude already serializes the conversation; we read what it writes |
| A17 | cwd → halo mapping | **Per-machine `~/.atlas/mapping.json`** — explicit ordered list of glob → halo_id rules. Hand-edited; no auto-detection |
| A18 | Write/steer path | **Deferred to v1.6+.** v1.5 ships read-only |
| A19 | Bridge auth | **Supabase service-role key** in the bridge's env. Single-user system; the bridge writes rows with an explicit `owner_id` it resolves once at startup |

## B. Architecture

```
Each HPC + macbook                          Supabase                  Atlas (Vercel)
──────────────────────                      ────────                  ───────────────
~/.claude/projects/<cwd>/                                              
  <session-uuid>.jsonl    ◄── tail by ──    claude_sessions     ◄──  cockpit subscribes
   (grows in real time)   atlas-bridge       (machine, halo,         via Realtime;
                          ↓ push deltas      cwd, last_seen)         renders Sessions
~/.atlas/mapping.json     ↓                  session_messages        zone in halo panel
   cwd-glob → halo_id     ↓                  (sequence, role,        + halo glow on map
                                              content, ts)
```

One long-running `atlas-bridge` script per machine. It:
1. Reads `~/.atlas/mapping.json` once at startup.
2. Watches `~/.claude/projects/` recursively for new + modified `.jsonl` files (via `chokidar`).
3. For each watched JSONL:
   - **First seen:** upsert `claude_sessions` row (hostname = `os.hostname()`, session_id = filename stem, cwd = decoded parent dir, halo_id = mapping lookup, started_at = file mtime).
   - **New lines appended:** insert `session_messages` rows with monotonic sequence (= JSONL line index). Idempotent on `(session_id, sequence)`.
   - **No write activity for 5 min:** mark `status = 'idle'`.
   - **File deleted / session closed:** mark `status = 'ended'`.
4. Heartbeats `claude_sessions.last_seen` every 30s for active sessions, so the cockpit can show "offline" for stale rows.

## C. Schema

New migration `supabase/migrations/0002_claude_sessions.sql`:

```sql
create table public.claude_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  hostname text not null,
  claude_session_id text not null,                    -- the UUID Claude Code uses in the filename
  halo_id text references public.halos(id) on delete set null,  -- nullable: track unmapped sessions too
  cwd text not null,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'idle', 'ended')),
  unique (owner_id, hostname, claude_session_id)
);

create index claude_sessions_owner_halo_seen_idx
  on public.claude_sessions (owner_id, halo_id, last_seen desc);

create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.claude_sessions(id) on delete cascade,
  sequence integer not null,                          -- monotonic per session, = JSONL line index
  role text not null,                                 -- user | assistant | tool_use | tool_result | system | meta
  content jsonb not null,                             -- the raw JSONL line, or a normalized subset
  recorded_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create index session_messages_session_seq_idx
  on public.session_messages (session_id, sequence);

-- RLS: owner sees only their own sessions + messages.
alter table public.claude_sessions enable row level security;
create policy "claude_sessions: owner all"
  on public.claude_sessions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter table public.session_messages enable row level security;
create policy "session_messages: owner all"
  on public.session_messages for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
```

`role` is a free-text column (not a CHECK enum) because Claude Code's JSONL has many event types beyond just user/assistant (last-prompt, tool_use_result, system, etc.) and we want forward-compat.

## D. Bridge script

`scripts/atlas-bridge.ts`. Run via `npm run bridge`. Single Node process per machine.

Pseudocode:

```ts
const mapping = readMapping("~/.atlas/mapping.json");
const ownerId = await resolveOwnerId(mapping.owner_email);
const hostname = os.hostname();

const watcher = chokidar.watch("~/.claude/projects", { persistent: true });

const sessionState = new Map<string, { rowId: uuid; lastLine: number }>();

watcher.on("add", async (filePath) => {
  if (!filePath.endsWith(".jsonl")) return;
  const { cwd, sessionId } = parsePath(filePath);
  const haloId = mapHalo(cwd, mapping);
  const row = await supabase.from("claude_sessions").upsert({
    owner_id: ownerId, hostname, claude_session_id: sessionId,
    halo_id: haloId, cwd, started_at: statMtime(filePath),
  }, { onConflict: "owner_id,hostname,claude_session_id" }).select().single();
  sessionState.set(filePath, { rowId: row.id, lastLine: 0 });
});

watcher.on("change", async (filePath) => {
  const state = sessionState.get(filePath);
  if (!state) return;
  const newLines = await readLinesFrom(filePath, state.lastLine);
  const rows = newLines.map((line, i) => ({
    owner_id: ownerId,
    session_id: state.rowId,
    sequence: state.lastLine + i,
    role: parseRole(line),
    content: JSON.parse(line),
  }));
  await supabase.from("session_messages").upsert(rows, {
    onConflict: "session_id,sequence",
  });
  state.lastLine += newLines.length;
  await supabase.from("claude_sessions")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", state.rowId);
});

setInterval(heartbeatActiveSessions, 30_000);
setInterval(markIdleSessions, 60_000);  // > 5min since last_seen → idle
```

### Edge cases the bridge must handle

- **File rotation** — Claude Code doesn't rotate JSONLs that I know of, but if a session restarts with the same UUID, sequence must continue cleanly. `upsert` on `(session_id, sequence)` handles re-runs.
- **Partial line writes** — if a JSONL line is mid-flush when we read, JSON.parse throws. Either tail with a line-by-line iterator that blocks until newline, or buffer + retry. The `readline` Node module handles this.
- **Catch-up on bridge start** — a session that already has 500 lines when the bridge starts gets all 500 inserted at startup. Idempotent via composite unique key.
- **Sensitive content in transcripts** — Claude Code transcripts include everything Andreas pasted into Claude. Since rows are RLS-scoped to him and the database is single-tenant, this is acceptable. Document the implication in the bridge file header.

## E. Mapping config

`~/.atlas/mapping.json`:

```json
{
  "owner_email": "andrewtersenov@gmail.com",
  "halos": [
    { "pattern": "/Users/atersenov/Software/atlas",         "halo_id": "personal-site" },
    { "pattern": "/Users/atersenov/Software/atlas/**",      "halo_id": "personal-site" },
    { "pattern": "/scratch/at/bnt-cnn/**",                  "halo_id": "bnt-cnn" },
    { "pattern": "/scratch/at/wavelet/**",                  "halo_id": "wavelet-l1-norm" },
    { "pattern": "/scratch/at/research/**",                 "halo_id": "thesis" }
  ]
}
```

- Glob patterns matched in order; first match wins. `**` matches multiple path segments; `*` matches one.
- `owner_email` resolved to a Supabase `auth.users.id` once at bridge startup (via a tiny `/api/bridge/resolve-owner` endpoint that takes an email + a shared bootstrap secret, or just a service-role query at bridge startup).
- One mapping file per machine (paths differ between macbook / titan / rorqual). Maintained alongside `~/.atlas/` rather than dotfiles-claude so machine-specific paths stay machine-local.

## F. Cockpit changes

### New "Sessions" zone in `/cockpit/[haloId]/page.tsx`

Positioned between the header and the Activity zone:

```
Sessions  3 active · 1 idle
  rorqual · /scratch/at/bnt-cnn               2m ago     [expand]
  titan   · /scratch/at/wavelet-bench         just now   [expand]
  macbook · /Users/at/Software/atlas          15s ago    [expand]
```

Expanding a session reveals a scrollable transcript view — last ~50 messages, with "show earlier" pagination. Server component for first paint; Realtime subscription on the client for live updates. The expanded view renders messages by role:
- `user` → light text, indented
- `assistant` → primary text
- `tool_use` → mono, with the tool name as a tag
- `tool_result` → small mono block

### Halo glow on cockpit map

Replaces the v1.6 GitHub-derived signal with a session-recency signal:
- For each halo, compute `last_session_activity = max(claude_sessions.last_seen WHERE halo_id = h)`.
- Halos with activity in the last 5 minutes glow brightest, fading over 60 minutes to flat.
- Halos with no recent session activity stay at the v0 base intensity.

This is a better signal than GitHub commits: it reflects *current* work, not past commits.

The "Activity" zone (GitHub feed) stays — it shows historical events; "Sessions" shows live state. Different time horizons.

## G. Acceptance criterion

> Andreas opens `/cockpit` from his macbook (or phone browser, signed in). He sees the cosmic-web map with halos glowing brighter where Claude sessions are currently active. Clicking the `bnt-cnn` halo opens its panel; the Sessions zone shows a row "rorqual · /scratch/at/bnt-cnn · 1m ago". Expanding it reveals the live transcript. Within 30 seconds of him sending a prompt to that tmux'd Claude session on rorqual, the new message appears in the cockpit.

Decomposed into a binary checklist:

1. ✅ Bridge installed on macbook + at least one HPC (titan or rorqual).
2. ✅ `~/.atlas/mapping.json` configured on each machine.
3. ✅ Start a Claude session on each machine in a mapped directory.
4. ✅ `/cockpit/[that halo]` shows the session in its Sessions zone within 30s.
5. ✅ Expanding the session shows the recent transcript.
6. ✅ Sending a new prompt to the tmux'd Claude → the new user message and assistant response appear in the cockpit within 30s.
7. ✅ Closing the tmux pane → session row marked `ended` (or `idle` if just paused) within 6 min.
8. ✅ Cockpit map: halos with recent sessions glow brighter than halos with none.
9. ✅ Signing out → no cockpit access; the bridge keeps running but writes are RLS-scoped so a logged-out cockpit user sees nothing.

## H. What's NOT in v1.5

- **Steering** (sending messages from cockpit to a Claude session). v1.6.
- **Multi-session interleaved view** (one merged transcript per halo across all machines). v2.
- **Notifications** ("agent finished on rorqual", push to Discord/email). v2.
- **Cost / usage tracking** (Claude Max billing has no per-session cost anyway). out of scope.
- **Auto-detection of mapping** (cwd → halo by git remote, project name, etc.). v2 if needed; manual mapping is fine for ≤20 halos.
- **Bridge auto-start on HPCs** (systemd-user units). v1.5 launches the bridge via a tmux window per machine. Wire into systemd in v1.6 once the pattern is proven.

## I. Effort estimate

| Slice | Effort |
|-------|--------|
| Migration 0002 + regenerate database.types.ts | 0.5d |
| `lib/atlas-mapping.ts` + `lib/atlas-transcript.ts` (parsing helpers) | 0.5d |
| `scripts/atlas-bridge.ts` (watcher, upsert loop, heartbeat) | 1.5d |
| Cockpit Sessions zone (server + client component) | 0.75d |
| Realtime subscription wiring | 0.5d |
| Halo glow update on cockpit map | 0.5d |
| Manual deploy: install bridge + mapping on 2+ machines, smoke test | 0.5d |

**Total: ~4.5d** (vs original Phase 5's 2.5d for Modal-based dispatch).

## J. Deployment notes

Per machine:
- **macbook**: `npm run bridge` in a long-running tmux window for v1.5. launchd plist in `~/dotfiles-claude/hosts/macbook/` later.
- **titan / rorqual**: `npm run bridge` in a tmux window on the login node. `systemd --user` units in `~/dotfiles-claude/hosts/<host>/` once stable.

The bridge ships as part of this repo (`scripts/atlas-bridge.ts` + a `package.json` script). On the HPCs, Andreas clones the repo and runs `npm install --omit=dev` + `npm run bridge`. No need to install the full Atlas web app there — only `lib/`, `scripts/`, and their deps are needed. (If the install gets heavy, we can carve out a separate `bridge/` workspace later.)

## K. Open questions

These don't block sign-off — flagging in case Andreas wants to weigh in before I start coding:

1. **Transcript content storage shape.** Store the raw JSONL line per row (`content jsonb = JSON.parse(line)`), or normalize into structured `{ text, tool_calls, tool_results }`? Raw is simpler and forward-compat with Claude Code event changes; normalized is faster to render. Default: raw, normalize at render time.
2. **Session ID semantics.** Claude Code's session UUIDs are stable per `claude` invocation. If Andreas resumes a session (`claude -c`), does it keep the UUID or get a new one? Worth verifying empirically before shipping; if resume creates a new UUID, sessions feel "broken into chunks" in the cockpit. Mitigation: link consecutive sessions with same cwd via a `resumed_from` column (deferred).
3. **Privacy belt-and-braces.** Transcripts include everything Andreas types. He's the only user. But if he ever opens the cockpit on a screen others can see, the transcript renders verbatim. Should the cockpit have a "blur transcripts" toggle? Probably not v1.5 — flagged for v1.6.

## L. Resolved choices (2026-05-23)

After plan walk-through with Andreas:

| Question | Choice |
|---|---|
| Which machines for v1.5 | **macbook + titan**. Rorqual added in a follow-up if titan setup proves the pattern |
| Where the bridge code lives | **In this Atlas repo**. Shared types beat the clone-size cost on the HPC |
| How the bridge is started | **Manually in a tmux window per machine**. `npm run bridge` and walk away. launchd / systemd-user wiring deferred |
| Sessions zone placement in the panel | **Above the GitHub Activity feed**. Both visible at once, no tab toggle |
| HPC | **titan** (interactive, no scheduler — fits a long-running bridge process) |

## M. Status

**Plan signed off 2026-05-23. Cutting `v1.5-claude-observatory` and starting with the migration so Andreas can verify the schema before any bridge code lands.**

## N. Hardening pass (2026-06-10, Fable 5 session)

Four fixes applied to the PR before the titan rollout, after auditing the
implementation against real transcript data (~61MB / 14.4K lines on macbook,
avg 4.2KB/line, 68% of volume in tool results):

1. **Stat-polling on Linux** (`usePolling`, 3s interval, `ATLAS_POLL`
   override). inotify doesn't see writes made by a different NFS/Lustre
   client — a rorqual compute-node session is invisible to a login-node
   bridge with native watching — and Lustre's inotify support is unreliable
   even single-node. macOS keeps fsevents.
2. **Offset tail reads.** The bridge was re-reading the whole transcript on
   every change event — O(file²) on files that reach several MB while Claude
   flushes multiple times per second, doubly bad over a network filesystem.
   Now tracks a per-file byte offset, reads only the appended bytes, and
   carries partial trailing lines as bytes until their newline arrives.
   Per-file drains are serialized (in-flight + rerun flags) so overlapping
   change events can't assign stale sequence numbers.
3. **Mapped-only ingestion + string caps.** Unmapped sessions keep their
   `claude_sessions` row (so the cockpit can say "unmapped session on titan")
   but their transcript content is no longer ingested — 23 of 25 sessions in
   the first smoke were unmapped noise burning the 500MB Supabase free tier.
   `sanitizeForJsonb` now also caps any string at 4KB with an explicit
   truncation marker; Atlas is a viewer, not an archive — the full transcript
   stays on the source machine. Amends K1: content is still shape-raw, but
   bounded.
4. **Conversation-only rendering + honest liveness.** Server fetch and the
   Realtime subscription filter to `role in (user, assistant, malformed)` so
   the last-50 window holds meaningful events instead of bookkeeping noise;
   tool results (user-type events carrying `tool_result` blocks) get their
   own "tool" label instead of masquerading as "you". Session status is now
   derived from file mtime, not bridge-start time, so a bridge restart no
   longer lights up weeks-old transcripts as "active" for 5 minutes.

5. **Stable machine identity.** The first smoke run of this pass caught
   `os.hostname()` following DHCP/DNS: the same macbook registered as
   `Andreass-MacBook-Pro.local` on 2026-06-07 and `mrgdhpc218.physics.uoc.gr`
   on 2026-06-10, duplicating every session row (hostname is part of the
   unique key). `mapping.json` now carries a required-in-practice `machine`
   label ("macbook" / "titan" / "rorqual") that the bridge stores in
   `claude_sessions.hostname`; os.hostname() remains only as a warned
   fallback.

Open question K2 (resume semantics) was settled empirically: across all 55
transcripts on macbook there are zero resumed sessions (Andreas `/clear`s
instead), and an 18-day session kept one UUID and one file across multiple
compactions. Session = file = row holds in practice; `--resume` would mint a
new file with copied history (duplicate rows under a new session) — accepted
for v1.5, dedupe if it ever happens.
