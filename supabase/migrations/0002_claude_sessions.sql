-- Atlas v1.5 — cross-machine Claude observatory
-- Two tables that a per-machine `atlas-bridge` process populates by tailing
-- Claude Code's per-session JSONL transcript files at
-- ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl.
--
-- Design:
--   * claude_sessions = one row per (owner, machine, claude session UUID).
--     Heartbeated by the bridge; status flips active→idle after ~5min of no
--     transcript writes, and ended when the bridge sees the file removed or
--     the session marked closed.
--   * session_messages = one row per JSONL line, keyed by (session, sequence)
--     so the bridge's upserts are idempotent on restart / catch-up.
--   * Both tables are RLS-scoped to owner. The bridge writes via the service
--     role key, which bypasses RLS — it sets owner_id explicitly per row.
--
-- See docs/V1_5_PLAN.md §C for the prose version of this schema.

-- ─── claude_sessions ──────────────────────────────────────────────────────
create table public.claude_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- machine identity. hostname = os.hostname() from the bridge; session_id =
  -- the UUID Claude Code uses in the transcript filename. The composite
  -- (owner, hostname, claude_session_id) is the natural key the bridge uses
  -- for upserts.
  hostname text not null,
  claude_session_id text not null,

  -- halo_id is nullable so unmapped sessions still get tracked. The bridge
  -- resolves it from ~/.atlas/mapping.json on each machine; unmapped sessions
  -- surface in the cockpit's "unmapped" bucket (or just stay invisible until
  -- the mapping file is updated).
  halo_id text references public.halos(id) on delete set null,

  cwd text not null,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),

  -- active = the bridge is currently appending messages
  -- idle   = no writes for >5min but the file still exists
  -- ended  = the bridge has seen the file go away (session closed) or has
  --          been told to mark it ended
  status text not null default 'active' check (
    status in ('active', 'idle', 'ended')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One session row per (user, machine, Claude session UUID). If the bridge
  -- restarts and re-sees the same transcript, the upsert lands on this key.
  unique (owner_id, hostname, claude_session_id)
);

-- Cockpit reads per-halo recent sessions; main access pattern is
-- "give me all of $owner's sessions for halo $h, newest first."
create index claude_sessions_owner_halo_seen_idx
  on public.claude_sessions (owner_id, halo_id, last_seen desc);

create trigger claude_sessions_set_updated_at
  before update on public.claude_sessions
  for each row execute function public.tg_set_updated_at();

alter table public.claude_sessions enable row level security;

create policy "claude_sessions: owner all"
  on public.claude_sessions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ─── session_messages ─────────────────────────────────────────────────────
create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.claude_sessions(id) on delete cascade,

  -- Monotonic per session, equal to the JSONL line index the bridge read it
  -- from. This makes the bridge's upserts idempotent on catch-up: re-reading
  -- a transcript from line 0 lands on the same (session_id, sequence) rows
  -- and the upsert is a no-op.
  sequence integer not null,

  -- Free-text rather than a CHECK enum. Claude Code's JSONL has many event
  -- types (user, assistant, tool_use, tool_result, system, last-prompt,
  -- summary, …) and adding any new type shouldn't require a migration.
  -- Normalization to a smaller set of UI roles happens at render time.
  role text not null,

  -- The full parsed JSONL line. Storing raw is forward-compatible with
  -- Claude Code's event format changes; we normalize at render time.
  content jsonb not null,

  recorded_at timestamptz not null default now(),

  unique (session_id, sequence)
);

-- Cockpit reads "the latest N messages for a session"; this index covers
-- both the session filter and the ORDER BY sequence DESC.
create index session_messages_session_seq_idx
  on public.session_messages (session_id, sequence);

alter table public.session_messages enable row level security;

create policy "session_messages: owner all"
  on public.session_messages for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ─── Realtime ─────────────────────────────────────────────────────────────
-- Cockpit subscribes via @supabase/supabase-js realtime; the publication
-- below ensures the new tables show up on the `supabase_realtime` channel.
-- (Supabase enables this on the public schema by default for the
-- supabase_realtime publication, but ALTER PUBLICATION here makes the intent
-- explicit and safe against publication-tightening in dashboards.)
alter publication supabase_realtime add table public.claude_sessions;
alter publication supabase_realtime add table public.session_messages;
