-- Atlas v1.1 — initial schema
-- Mirrors docs/ATLAS_HANDOFF.md §5, with the v1 additions from docs/V1_PLAN.md:
--   * A10 — owner_id columns on per-user tables, RLS policies `auth.uid() = owner_id`
--   * A6 — halos and filaments are world-readable: RLS is enabled with a permissive
--          SELECT policy; INSERT/UPDATE/DELETE are blocked for anon + authenticated
--          (the seed script writes via the service-role key, which bypasses RLS).
--   * A14 — no oauth_tokens table in v1 (GitHub uses a PAT, no OAuth flow)

-- ─── extensions ───────────────────────────────────────────────────────────
-- `gen_random_uuid()` requires pgcrypto. Supabase enables it by default but
-- declaring it explicitly makes the migration portable.
create extension if not exists "pgcrypto";

-- ─── helpers ──────────────────────────────────────────────────────────────

-- updated_at maintenance trigger function (reused across tables)
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── halos ────────────────────────────────────────────────────────────────
-- Source of truth: data/halos.json (re-seeded into this table via scripts/seed.ts)
-- Public read: same rows for every user; per-user activity overlays live in halo_integrations etc.
create table public.halos (
  id text primary key,                                      -- e.g. "thesis", "bnt-cnn"
  name text not null,
  domain text not null check (domain in (
    'research', 'career', 'infrastructure', 'teaching', 'personal', 'bronze'
  )),
  -- description is `not null` so it stays in sync with the zod schema in
  -- lib/halo-schema.ts (HaloSchema.description: z.string()). Default '' keeps
  -- backfills safe if someone inserts a halo without one.
  description text not null default '',
  description_long text,
  is_public boolean not null default false,
  position_x real not null,
  position_y real not null,
  radius real not null,
  glyph_type text not null,
  status text not null default 'active' check (status in (
    'active', 'dormant', 'completed', 'locked'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger halos_set_updated_at
  before update on public.halos
  for each row execute function public.tg_set_updated_at();

-- Public read, no writes (seeding happens via service role)
alter table public.halos enable row level security;
create policy "halos are world-readable"
  on public.halos for select
  using (true);

-- ─── filaments ────────────────────────────────────────────────────────────
-- Source of truth: data/filaments.json
create table public.filaments (
  id uuid primary key default gen_random_uuid(),
  from_halo_id text not null references public.halos(id) on delete cascade,
  to_halo_id text not null references public.halos(id) on delete cascade,
  strength text not null default 'medium' check (strength in ('primary', 'medium', 'faint')),
  kind text not null,                                       -- knowledge | dependency | career_arc | infrastructure | teaching
  description text,
  via_junction text,                                        -- nullable: e.g. "wavelet-hub"
  created_at timestamptz not null default now(),
  -- Composite uniqueness so the seed script's upsert is idempotent
  unique (from_halo_id, to_halo_id, kind)
);

create index filaments_from_idx on public.filaments (from_halo_id);
create index filaments_to_idx on public.filaments (to_halo_id);

alter table public.filaments enable row level security;
create policy "filaments are world-readable"
  on public.filaments for select
  using (true);

-- ─── halo_integrations ────────────────────────────────────────────────────
-- Per-user provider config for a halo. config is provider-specific JSON.
-- Example (Phase 4): { provider: "github", config: { repos: ["owner/repo1", ...] } }
create table public.halo_integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  halo_id text not null references public.halos(id) on delete cascade,
  provider text not null,                                   -- gmail | gcal | github | todoist | slack | zotero | zoom
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, halo_id, provider)                      -- one config per (user, halo, provider)
);

create index halo_integrations_owner_halo_idx on public.halo_integrations (owner_id, halo_id);
create trigger halo_integrations_set_updated_at
  before update on public.halo_integrations
  for each row execute function public.tg_set_updated_at();

alter table public.halo_integrations enable row level security;
create policy "users see only their own halo_integrations"
  on public.halo_integrations for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ─── halo_agents ──────────────────────────────────────────────────────────
-- Agents available to dispatch from a halo. context_md is the per-halo CLAUDE.md preamble.
create table public.halo_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  halo_id text not null references public.halos(id) on delete cascade,
  kind text not null check (kind in ('on_demand', 'monitor', 'workflow')),
  name text not null,
  description text,
  context_md text,
  config jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index halo_agents_owner_halo_idx on public.halo_agents (owner_id, halo_id);
create trigger halo_agents_set_updated_at
  before update on public.halo_agents
  for each row execute function public.tg_set_updated_at();

alter table public.halo_agents enable row level security;
create policy "users see only their own halo_agents"
  on public.halo_agents for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ─── agent_runs ───────────────────────────────────────────────────────────
-- History of agent dispatches. Modal writes these via service-role from the function.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.halo_agents(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  input jsonb,
  output jsonb,
  cost_usd numeric(10, 6),
  error text,
  created_at timestamptz not null default now()
);

create index agent_runs_owner_agent_idx on public.agent_runs (owner_id, agent_id, started_at desc);

alter table public.agent_runs enable row level security;
create policy "users see only their own agent_runs"
  on public.agent_runs for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ─── user_settings ────────────────────────────────────────────────────────
-- App-specific per-user state (Supabase Auth manages auth.users separately).
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_view text not null default 'public' check (default_view in ('public', 'cockpit')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.tg_set_updated_at();

alter table public.user_settings enable row level security;
create policy "users see only their own user_settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── allow-listed sign-up trigger (Andreas only for v1) ───────────────────
-- Rejects new sign-ups whose email isn't in the allow-list table.
-- Implemented as a `before insert` trigger on auth.users so the rejection
-- happens at the auth.users insert moment (returned as an auth API error).
create table public.allowed_emails (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by text
);

-- Seed with Andreas's email (per operational decision in V1_PLAN.md)
insert into public.allowed_emails (email, added_by)
  values ('andrewtersenov@gmail.com', 'v1.1 migration')
  on conflict (email) do nothing;

-- Lock down: allowed_emails contains user PII; never expose via PostgREST.
-- RLS enabled with no policies = anon + authenticated reads are denied.
-- The signup trigger below runs as `security definer` so it can still
-- read the table to enforce the allow-list during auth.users inserts.
alter table public.allowed_emails enable row level security;

create or replace function public.enforce_email_allow_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where lower(email) = lower(new.email)
  ) then
    raise exception 'Sign-up rejected: % is not on the allow-list', new.email
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;

create trigger enforce_email_allow_list_on_signup
  before insert on auth.users
  for each row execute function public.enforce_email_allow_list();
