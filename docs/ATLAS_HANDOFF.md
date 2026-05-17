# Atlas — Personal OS Handoff

**Status:** v0 design locked. Implementation begins.
**Owner:** Andreas Tersenov
**Last updated:** 2026-05-14

---

## 1. What Atlas is

Atlas is a personal operating system that takes the visual form of a cosmic web. Each project in Andreas's life is a luminous halo on the web. The filaments connecting halos represent shared knowledge, dependencies, and career arcs. The entire structure sits on a textured cosmological-simulation backdrop — pink-magenta matter density on a deep purple void.

The visual is not decoration. It is the interface. The cosmic-web map serves three layered jobs:

1. **Public showcase** — a memorable portfolio piece on Andreas's site. Visitors see the structure of his work and life at a glance, instead of a vertical CV.
2. **Private cockpit** — behind auth, halos light up with real-time activity (commits, calendar events, emails, papers). The map becomes a navigation surface for everything.
3. **Agent dispatch surface** — clicking a halo opens a command panel where Andreas dispatches Claude agents preloaded with that project's context.

Of the three, the **agent dispatch layer is the differentiator.** Notion, Obsidian, Heptabase, and the rest of the Life-OS landscape are document tools. Atlas is the inverse: an agent-dispatch surface with summaries as supporting infrastructure. The map exists so agents are easy to launch with the right context.

---

## 2. About Andreas (context for any agent reading this)

- PhD candidate in computational cosmology, joint between University of Crete and CEA Paris-Saclay (Starck, Kilbinger, Lanusse).
- Thesis topic: weak gravitational lensing — mass mapping, higher-order statistics, Bayesian/SBI inference, JAX-based pipelines.
- Defending in ~3-4 months (Aug-Sep 2026).
- Postdoc at UVa (GECO / CosmicAI) starting October 12, 2026.
- Heavy Claude Code power user. Has existing infrastructure: custom CLAUDE.md scaffolding, skills, subagents, `/loop` patterns for arxiv and SLURM.
- Aesthetic instinct: scientific, data-viz literate, prefers thoughtful technical design over generic SaaS polish.
- Identity-wise: Greek, based in Athens when not at Saclay, thinking about the academic→industry transition.

**Implication for design:** Andreas can read a JAX traceback, a corner plot, and a TensorFlow model spec at sight. Don't dumb anything down. He will notice generic AI-template aesthetics and react badly. He wants Atlas to feel like *his* tool — specific, technical, beautiful.

---

## 3. Visual reference

The canonical visual reference is `references/atlas_cosmic_web_v8.svg` — the SVG rendered at the end of our design conversation. Any production rendering should use it as a target.

### Aesthetic principles (hard-won through iteration, do not relitigate)

These are decisions that emerged from many rounds of refinement. They are settled. If they need to be revisited, do it deliberately, not by drift.

- **Cosmic web is the world, not the wallpaper.** The web fills the entire canvas. Halos sit *in* the web, not on top of an empty background.
- **Filaments are matter chains, not curves.** Render each filament as a sequence of small overlapping elliptical "matter clumps" with the warm radial gradient, rotated to follow the local direction, with size variation and small perpendicular offsets. Do NOT use dotted strokes along Béziers — they read as engineered curves.
- **Halos are embedded.** Each halo has a soft outer haze that blends into the cosmic-web texture, then a thin boundary outline, then a sharp interior glyph. The boundary between halo and web is fuzzy on the outside, crisp on the inside.
- **Glyphs are individuated.** Each halo's interior glyph depicts what the project *is* — a hexagonal DAG with Einstein-ring arcs at the Thesis core, the literal UVa Rotunda for Postdoc, sheared galaxy ellipses on a survey patch for Euclid HOWLS, a wavelet quadtree for l1-norm, a small MLP for the emulator, and so on. The glyphs are technical scientific illustrations, not generic icons.
- **Color palette is warm pink-magenta** (Image 1 of the references). Base background `#1A0828`. Filaments use warm gradients: `#FFE0A8` → `#FFA068` → `#C04880` → `#702060`. Halos use their domain colors (see below). Brightest knots are warm cream `#FFE8B0`.
- **Career arc is the brightest spine.** Thesis → Thesis defense → Postdoc UVa → CCA NY trip is the brightest, hottest, thickest matter chain on the map. Other connections are progressively dimmer.
- **Ambient cosmic web goes in all directions.** Vertical, diagonal NW-SE, diagonal NE-SW, mixed angles. Never horizontal-biased.
- **Two named junctions visible** as bright blooms: the *wavelet methodology hub* (~340, 270) and the *DL/mass-mapping hub* (~370, 395). Plus several smaller secondary junctions where filaments cross.
- **Things to restore in production that got dropped in v8:** the faint cross-cluster dashed connections (infrastructure→research, teaching→thesis, 3MT→thesis, etc.) and the domain labels in mono caps (RESEARCH, CAREER, INFRASTRUCTURE, TEACHING, PERSONAL · PRIVATE).

### Color palette (canonical hex codes)

| Domain | Halo glow | Halo accent | Glyph color |
|---|---|---|---|
| Research | `#E8A23D` | `#FFD176` | `#FFD89B` |
| Career | `#5BB8C4` | `#7FD0DC` | `#A8DAE0` |
| Infrastructure | `#9B6BC4` | `#C5A8DC` | `#E8D6F4` |
| Teaching | `#6FA86F` | `#A8D8A8` | `#D5EED5` |
| Bronze (3MT) | `#C49B5B` | `#F0DAA8` | `#F0DAA8` |
| Private | `#7A7A82` | `#9C9CA8` | `#9C9CA8` |

| Cosmic web element | Color |
|---|---|
| Background base | `#1A0828` |
| Nebula tints (research region) | `#5A1830` |
| Nebula tints (career region) | `#3A2050` |
| Nebula tints (infrastructure region) | `#3F1A50` |
| Nebula tints (teaching region) | `#3A2540` |
| Nebula tints (personal region) | `#3F1830` |
| Matter clump bright (career arc) | `#FFE0A8` → `#FFA068` → `#C04880` |
| Matter clump warm (main filaments) | `#FFC088` → `#D06090` → `#702060` |
| Matter clump dim (ambient web) | `#D080A8` → `#8040A0` → `#40208A` |
| Knot center (brightest matter) | `#FFE8B0` → `#FFB070` → `#E04880` |
| Junction bloom center | `#FFFFFF` → `#FFEDC0` → `#FF8870` → `#E04880` |

---

## 4. Architecture

The stack, decided:

- **Frontend:** Next.js 14+ (App Router) + React + TypeScript + Tailwind.
- **Map rendering:** HTML5 Canvas + React for v0. Migrate to **PixiJS** when v1+ animation/interaction demands it. (Do not use D3 for the map itself — D3's strength is SVG-based viz, and we're past the SVG complexity ceiling. D3 utilities like `d3-force` and `d3-scale` may still be useful programmatically.)
- **Auth:** Clerk. (Fastest path to public/private split. Supabase Auth is the fallback if Clerk's pricing or vendor lock-in becomes an issue.)
- **Database:** Supabase (Postgres + pgvector). pgvector is for later — embedding project descriptions to auto-layout halos by semantic similarity.
- **Backend / agent runtime:** FastAPI on **Modal**. Modal because (a) it's serverless Python so you only pay when agents run, (b) it has clean Anthropic SDK support, (c) it handles long-running workflows natively. Railway is the fallback if Modal becomes constraining.
- **Deployment (frontend):** Vercel. Public layer ships as static via SSG, private layer uses SSR with Clerk middleware.
- **External APIs:** Gmail API, Google Calendar API, GitHub REST API, Todoist REST API, Slack Web API, Discord Webhooks, Zotero Web API, Zoom REST API. All via OAuth where applicable.
- **Tool migration decision:** Mac Mail, Mac Calendar, and Mac Notes will be migrated to Gmail, Google Calendar, and a TBD note-taking tool (probably no migration — keep Mac Notes for now). This eliminates the need for a local Mac sync daemon.

### Why these specific choices

The non-obvious ones explained:

- **Custom build over Notion/Obsidian:** Andreas explicitly rejected building on top of these. The public/private layering, the cosmic-web visualization, and the agent dispatch all require custom code. None of the existing PKM tools can deliver this.
- **Next.js over Astro/SvelteKit:** Andreas's existing personal-site work is React-leaning, and the agent dispatch surface benefits from React's component model for the command panels.
- **Modal over Railway/Fly:** Agent workloads are bursty (run for minutes, idle for hours). Modal's per-second billing fits this better than always-on servers. Also Modal has first-class support for long-running jobs with checkpoints.
- **Supabase over Firebase/PlanetScale:** Postgres + pgvector in one place. Andreas's data is relational (halos, agents, runs, integrations) and a future semantic-similarity layout uses embeddings.

---

## 5. Data model

Schemas as SQL. Tables are namespaced for clarity.

```sql
-- The halo: one row per project.
create table halos (
  id text primary key,                -- e.g. "thesis", "bnt-cnn"
  name text not null,
  domain text not null,               -- research | career | infrastructure | teaching | personal | bronze
  description text,                   -- short, ~1 sentence
  description_long text,              -- full description for the command panel
  is_public boolean not null default false,
  position_x real not null,           -- canvas coordinates from v8 reference
  position_y real not null,
  radius real not null,
  glyph_type text not null,           -- enum, see glyph catalog below
  status text not null default 'active',  -- active | dormant | completed | locked
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The filament: connections between halos.
create table filaments (
  id uuid primary key default gen_random_uuid(),
  from_halo_id text references halos(id),
  to_halo_id text references halos(id),
  strength text not null default 'medium',  -- primary | medium | faint
  kind text not null,                       -- knowledge | dependency | career_arc | infrastructure | teaching
  description text,                         -- "shared methodology", "depends on", etc.
  via_junction text,                        -- nullable: which junction (wavelet-hub, dl-hub, etc.)
  created_at timestamptz default now()
);

-- Integrations connected to a halo.
create table halo_integrations (
  id uuid primary key default gen_random_uuid(),
  halo_id text references halos(id),
  provider text not null,             -- gmail | gcal | github | todoist | slack | zotero | zoom
  config jsonb not null,              -- provider-specific: repo names, project labels, calendar IDs, query strings
  created_at timestamptz default now()
);

-- Agents available to dispatch from a halo.
create table halo_agents (
  id uuid primary key default gen_random_uuid(),
  halo_id text references halos(id),
  kind text not null,                 -- on_demand | monitor | workflow
  name text not null,
  description text,
  context_md text,                    -- the halo-specific CLAUDE.md preamble
  config jsonb,                       -- kind-specific config: schedule (monitor), checkpoints (workflow), etc.
  is_enabled boolean default true
);

-- Agent runs (history of dispatches).
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references halo_agents(id),
  status text not null,               -- queued | running | completed | failed
  started_at timestamptz,
  completed_at timestamptz,
  input jsonb,                        -- the dispatch payload
  output jsonb,                       -- streamed output, summary
  cost_usd numeric,
  error text
);

-- User session / settings (likely Clerk-managed, this is for app-specific state).
create table user_settings (
  user_id text primary key,
  default_view text default 'public', -- public | cockpit
  preferences jsonb default '{}'
);
```

### Glyph catalog

The interior glyphs are a closed enum of distinct visual types. Each halo specifies its `glyph_type`. The renderer maps `glyph_type` to a Canvas drawing function.

| `glyph_type` | Description | Used by |
|---|---|---|
| `thesis_dag_lens` | Hexagonal DAG with hub + 6 satellites, Einstein-ring arcs around the hub | thesis |
| `cnn_stack` | 3 stacked conv layer rectangles with output dots | bnt-cnn |
| `wavelet_quadtree` | Recursively subdivided square (wavelet decomposition) | wavelet-l1-norm |
| `transport_plan` | Two parallel rows of points with curved transport lines | opt-transport |
| `input_cnn_output` | Grid → CNN block → grid (mass map pipeline) | dl-mass-mapping |
| `method_grid_3x3` | 3×3 grid of small distinct icons (method comparison) | wavelet-benchmarks |
| `posterior_contours` | Rotated confidence ellipses + scattered samples + corner-plot ticks | mass-map-uncertainty |
| `mlp_small` | 3→2→1 MLP with weighted connections | l1-emulator |
| `survey_patch` | 4×4 sky patch with sheared galaxy ellipses | euclid-howls |
| `podium_panel` | Speaker figure + panel dots + Q&A arrows | thesis-defense |
| `rotunda` | Jefferson's Rotunda: dome + columns + base | postdoc-uva |
| `pins_flight_arc` | Two pins with a dashed flight arc and tiny plane | cca-ny-trip |
| `browser_window` | Window with controls + content lines | personal-site |
| `node_tree` | 3-level hierarchical tree with cross-connections | claude-infrastructure |
| `paper_highlight` | Document icon with corner fold + text lines + highlight band | claude-arxiv |
| `classroom_seating` | Podium + instructor + rows of seat dots | astrostat |
| `stopwatch_3min` | Stopwatch face with hand at 3 | 3mt |
| `padlock` | Padlock in a dashed circle | personal-private |

### `halos.json` seed data

The seed data lives in `data/halos.json`. Coordinates come from the v8 reference. Sketch:

```json
[
  {
    "id": "thesis",
    "name": "Thesis",
    "domain": "research",
    "description": "Weak lensing mass mapping, higher-order statistics, and cosmology inference.",
    "is_public": true,
    "position_x": 285,
    "position_y": 340,
    "radius": 60,
    "glyph_type": "thesis_dag_lens",
    "status": "active"
  },
  {
    "id": "bnt-cnn",
    "name": "BNT-CNN",
    "domain": "research",
    "description": "Finishing experiments. Paper writeup imminent.",
    "is_public": true,
    "position_x": 175,
    "position_y": 230,
    "radius": 28,
    "glyph_type": "cnn_stack",
    "status": "active"
  },
  /* ... etc for all 18 halos ... */
]
```

Full list of halos with positions in §6.

---

## 6. The halo catalog

All 18 halos. Public/private status reflects what Andreas confirmed: research, infrastructure, teaching are publicly visible; Postdoc UVa is public; **Anthropic STEM fellowship is locked private (not even applied yet)**; family/health/relationships/classified projects are private.

| ID | Name | Domain | Pos (x, y) | r | Public | Status |
|---|---|---|---|---|---|---|
| `thesis` | Thesis | research | 285, 340 | 60 | ✓ | active |
| `bnt-cnn` | BNT-CNN | research | 175, 230 | 28 | ✓ | active |
| `wavelet-l1-norm` | Wavelet l1-norm | research | 170, 415 | 30 | ✓ | active |
| `opt-transport` | Opt. transport | research | 80, 340 | 24 | ✓ | active |
| `dl-mass-mapping` | DL mass mapping | research | 310, 460 | 26 | ✓ | active |
| `wavelet-benchmarks` | Wavelet benchmarks | research | 325, 235 | 28 | ✓ | active |
| `mass-map-uncertainty` | Mass-map uncertainty | research | 430, 415 | 28 | ✓ | active |
| `l1-emulator` | l1 emulator | research | 460, 290 | 22 | ✓ | active |
| `euclid-howls` | Euclid · HOWLS | research | 405, 175 | 36 | ✓ | active |
| `thesis-defense` | Thesis defense | career | 525, 285 | 24 | ✓ | active |
| `postdoc-uva` | Postdoc · UVa | career | 588, 195 | 42 | ✓ | active |
| `cca-ny-trip` | CCA · NY trip | career | 595, 370 | 24 | ✓ | active |
| `anthropic-fellowship` | (private) | career | TBD | TBD | ✗ | dormant |
| `personal-site` | Personal site | infrastructure | 90, 85 | 22 | ✓ | active |
| `claude-infrastructure` | Claude infrastructure | infrastructure | 215, 75 | 32 | ✓ | active |
| `claude-arxiv` | Claude · arxiv | infrastructure | 320, 95 | 22 | ✓ | active |
| `astrostat` | AstroStat | teaching | 530, 465 | 36 | ✓ | active |
| `3mt` | 3MT | bronze | 130, 510 | 22 | ✓ | active |
| `personal-private` | Personal · private | personal | 370, 555 | 24 | ✗ | locked |

Public layer renders 17 halos. Private layer renders all 19 (including Anthropic and the personal cluster).

---

## 7. Filament catalog

Bright primary chains (career arc — render as the hottest cream-orange clumps):

- `thesis` ↔ `thesis-defense` (primary, career_arc)
- `thesis-defense` ↔ `postdoc-uva` (primary, career_arc)
- `postdoc-uva` ↔ `cca-ny-trip` (medium, career_arc)

Bright research connections (warm pink clumps):

- `thesis` ↔ `euclid-howls` (primary, knowledge)
- `thesis` ↔ all other research halos (medium, knowledge)

Methodology clusters (through implicit junctions):

- *Wavelet methodology hub* at (340, 270): `wavelet-l1-norm`, `wavelet-benchmarks`, `l1-emulator` connected via this junction
- *DL methodology hub* at (370, 395): `bnt-cnn`, `dl-mass-mapping`, `mass-map-uncertainty` connected via this junction
- `euclid-howls` connects to `l1-emulator`, `mass-map-uncertainty`, `wavelet-benchmarks` (the survey uses these methods)

Infrastructure backbone (purple, top of canvas):

- `personal-site` ↔ `claude-infrastructure` (medium)
- `claude-infrastructure` ↔ `claude-arxiv` (medium)
- `claude-infrastructure` → various research halos (faint, dashed — infrastructure powers research)

Teaching connections (green, lower right):

- `astrostat` ↔ `thesis` (medium, knowledge — teaching content draws from thesis)
- `astrostat` ↔ `cca-ny-trip` (medium, dependency — the trip *is* part of AstroStat)
- `astrostat` → `claude-infrastructure` (faint, dependency)

Cross-cluster faint:

- `3mt` → `thesis` (faint, knowledge — presenting thesis work)
- `personal-site` → `thesis` (faint, knowledge — publishing thesis)

**Restore in production:** the faint dashed cross-cluster connections were dropped in the v8 SVG iteration. Add them back when rendering.

---

## 8. System architecture: three layers

### Layer 1 — Public showcase (`/`)

Statically generated. The cosmic-web map renders with public halos only. Halo glyphs are visible and labeled. No clicks open anything authenticated; instead, clicks scroll to a vertical list of project blurbs below the map. The map IS the homepage.

Routing:
- `/` — the map + project blurbs
- `/about` — bio
- `/contact` — email + socials
- The map links into `/p/[halo-id]` pages that show public information per project (paper links, descriptions, status).

### Layer 2 — Private cockpit (`/cockpit`)

Behind Clerk auth. Same map but:
- All halos visible (including the locked Anthropic and personal-private cluster)
- Halo glow/intensity is driven by *real activity* from integrated tools
- Clicking a halo navigates to its command panel

Routing:
- `/cockpit` — the cockpit map
- `/cockpit/[halo-id]` — the command panel for a halo

### Layer 3 — Halo command panel (`/cockpit/[halo-id]`)

Four zones per halo:

1. **Header** — name, status, last activity time, next milestone, quick links to underlying tools (open in GitHub / open in Todoist / open in Gmail).
2. **Activity feed** — pulled-in summaries from integrated tools: Todoist tasks (filtered to this project), GitHub commits, calendar events, recent Gmail threads, Zotero additions. Each item links into the source tool.
3. **Agent strip** — three buttons / sections:
   - **Run a task** — dropdown of preconfigured on-demand agents + free-text input. Dispatches to the agent runtime.
   - **Active monitors** — list of background monitors with last result snippets. Toggle on/off.
   - **Workflows** — buttons for multi-step pipelines + history of past runs.
4. **Notes / log** — markdown editor for halo-specific notes that don't belong elsewhere.

---

## 9. Tool integrations — provider matrix

Buckets:

**Deep integration (data pulled into halo feeds):**

| Provider | API | Auth | Purpose |
|---|---|---|---|
| Gmail | Gmail API | OAuth | Filtered threads per halo (by label or search query) |
| Google Calendar | Calendar API | OAuth | Events tagged or color-coded per halo |
| GitHub | REST API | OAuth + PAT | Repo activity, PRs, issues per halo |
| Todoist | REST API | OAuth | Tasks filtered by project label |
| Zotero | Web API | API key | Collections per halo |
| Slack | Web API | OAuth | Channels per halo |
| Discord | Webhooks + REST | Bot token | Servers/channels per halo |
| Zoom | REST API | OAuth | Upcoming meetings per halo |

**Shallow integration (deep link only, no data sync):**

- VSCode — "open in VSCode" deep link (`vscode://file/...`)

**To be replaced:**

- Mac Mail → Gmail (migrate)
- Mac Calendar → Google Calendar (migrate)
- Mac Notes — keep for now (no integration), revisit later

**No integration:**

- Personal note systems — keep Andreas's existing flow

Each `halo_integrations.config` is provider-specific. Examples:

```json
// GitHub config
{ "repos": ["andreas/bnt-cnn", "andreas/jax-mass-mapping"] }

// Todoist config
{ "project_id": "thesis-bnt-cnn", "labels": ["bnt-cnn"] }

// Gmail config
{ "query": "label:thesis OR (from:starck OR from:kilbinger)" }

// Calendar config
{ "calendar_id": "primary", "color_id": "3" }
```

---

## 10. Agent dispatch architecture

Three dispatch modes, one shared runtime.

### Mode A — On-demand task

User clicks "Run a task," picks an agent (or types a free-form request), gets a streamed Claude response in-panel.

Architecture:
1. Frontend posts `POST /api/agents/dispatch` with `{ agent_id, input }`.
2. FastAPI on Modal:
   - Loads the agent's `context_md` (halo-specific CLAUDE.md preamble).
   - Loads the halo's recent integration data (last 24h of commits, today's calendar, etc.) as additional context.
   - Calls Claude via the Anthropic SDK with `model="claude-opus-4-7"`, streaming.
3. Frontend renders the streamed response in the command panel and writes the run to `agent_runs`.

### Mode B — Persistent monitor

Background loops that run on a schedule and surface findings to the halo's activity log.

Architecture:
1. Each monitor agent has a cron-like `config.schedule` (e.g. `"0 9 * * *"` for daily 9 AM).
2. Modal scheduled functions trigger them.
3. The monitor pulls fresh data from integrations, runs analysis via Claude, writes results to `agent_runs`.
4. If `output.urgency == "high"`, push a notification via Discord webhook to Andreas's personal channel.

High-value monitors to ship in v2:
- **arxiv-watcher** (per research halo): scans arXiv daily for new papers matching halo keywords, summarizes 1-2 most relevant.
- **slurm-watcher**: polls SLURM job status, summarizes failures or completions, drafts paragraph for run logs.
- **email-triage**: classifies new Gmail messages, drafts replies for routine threads, flags anything needing decision.

### Mode C — Long-running workflow

Multi-step pipelines that run for minutes-to-hours with checkpoints.

Architecture:
1. Each workflow is a Modal Function with `@modal.method` decorators on steps.
2. Workflow state persists in `agent_runs.output` (jsonb) at each checkpoint.
3. Frontend polls or subscribes to status updates.
4. Workflows can be paused, resumed, retried per-step.

Example workflows:
- **Paper-figure regenerator**: takes the latest run from a research halo, regenerates all figures via stored JAX scripts, drafts the paragraph that goes with each, opens a PR.
- **Trip-prep checklist**: for the NY trip halo, checks visa/ESTA/insurance/hotel/transit/etc against a "standard international academic trip" template, drafts missing-item emails.

---

## 11. Phased build plan

### v0 — Weekend (the public showcase) — ✅ SHIPPED 2026-05-14 (v0.1.0)

**Goal:** ship the public-facing cosmic-web map. No backend, no auth, no agents. Just the beautiful map deployable to Vercel.

Deliverables:
- Next.js project initialized. (Next.js 16 + React 19 + Tailwind v4 — App Router, page is fully static SSG.)
- `data/halos.json` with all 18 halos seeded from §6 — plus the locked personal-private halo rendered on the public map.
- `data/filaments.json` with all connections from §7.
- A `<CosmicWebMap>` React component rendering the map on HTML5 Canvas.
- Particle field, inter-halo filaments (matter chains), bright knots, halos with embedded haze + glyphs. (Ambient web and named-junction blooms ended up dropped — see lessons.)
- Hover state on halos (subtle brighten — pre-baked static + hover overlay).
- Click on a halo logs to console (`/p/[halo-id]` routing comes in v1).
- Domain labels (RESEARCH, CAREER, INFRASTRUCTURE, TEACHING, PERSONAL · PRIVATE) restored — anchored next to their clusters rather than canvas corners after iteration.
- Faint cross-cluster connections restored.
- ATLAS title chrome top-right (matched v8 sizing/letter-spacing).
- Deployed to Vercel.

Success criterion: the page loads in under 2 seconds and is indistinguishable from the v8 SVG reference at a glance. **Met** — page weight ~21KB HTML + 1.3MB rendered canvas, sub-second load on a warm cache; visual fidelity near-pixel-parity with v8 except for a few intentional cleanups (see lessons).

#### v0 lessons

What worked well:

- **Sprite-based clump rendering.** Pre-baking each matter gradient (`bright`, `warm`, `dim`, `knot`, `junction`) as a 128px sprite once, then drawing thousands of scaled+rotated instances via `drawImage`. ~10× faster than `createRadialGradient` per clump and held interactive frame rates trivially.
- **Pre-baking static layers to an offscreen canvas.** Hover repaints would re-render the whole scene if naïve. Instead we bake the static layers (nebula, particles, cross-cluster, filaments, halos, labels, chrome) once into an offscreen canvas, and on mouse-move we just blit the cache and draw a single hover overlay on top. Hover is ~free.
- **JSON-driven halo + filament data.** `data/halos.json` is the single source of truth — adding a project = one JSON edit. The schema matches §5 verbatim, so v1's Supabase migration is trivial.
- **Two-pass filament render with a "neuron-glow" underlay.** Each clump position is drawn twice: first a wide (3.2×) low-alpha (~0.38) `dim` sprite as a soft envelope, then the strength-appropriate bright/warm core on top. Mirrors v8's m-warm-under-m-bright stacking and gives the chains the "glowing ribbon" character. The two passes share an RNG seed derived from the filament's halo ids so positions match perfectly between layers.
- **All glyphs traced from the v8 SVG vertex-by-vertex.** Each glyph function takes pixel offsets from the SVG and scales them by `s = halo.r / Rsvg`. Lets glyphs work at any halo radius while matching v8 fidelity exactly — far better than the first-pass interpretations of the catalog descriptions.

What was harder than expected:

- **Glyph fidelity vs. catalog descriptions.** First pass at the 18 glyphs worked from §3's text descriptions. The result read as generic icons — not scientific illustrations. Required reading the SVG glyph code line-by-line and re-implementing each as exact pixel offsets. Whole-day rewrite once we discovered.
- **Filament aesthetic.** Several iterations: sparse beads (too thin, looked engineered), dense clumps (right density but no glow), finally landed on the two-pass neuron-glow which is what v8 actually does. The "clumps not strokes" instruction in §3 was load-bearing but the glow was implicit.
- **Layer noise vs. structure tension.** §3 says "Cosmic web is the world, not the wallpaper" — implying the canvas should be densely textured. Initial v0 had hundreds of ambient matter clumps + 7 long ambient chains filling background gaps. Reading flat as noise rather than texture; user explicitly asked to drop them. **Resolution: keep nebula tints + particle field for texture, but remove all background matter chains that don't connect halos.** This deviates from §3's "ambient cosmic web in all directions" but the result reads cleaner and the inter-halo filaments are more legible.
- **Domain label placement.** Labels in canvas corners (per spec) collided with halo labels and halo-haze edges in multiple cases. Final landing: anchored next to their respective clusters, inside the relevant nebula tint.

Technical decisions that emerged during implementation (not in the original handoff, worth memorialising):

- **Halo BG-mask for clean interiors.** To stop filaments / particles / cross-cluster dashes from bleeding through the halo and cluttering the glyph, every halo first paints a solid `BG`-coloured disc at `r * 0.98` before drawing its haze. The haze still extends past `r` (out to `~r * 1.78`) and blends with the cosmic web outside the boundary, so the "embedded in matter" character is preserved without interior clutter.
- **Two-stacked halo haze.** Originally a single radial gradient at `r * 1.7`. Switched to outer (`r * 1.78`) + mid (`r * 1.25`) stacked layers — the brighter overlap reads as a matter-embedded core rather than a flat disc. Thesis halo gets a per-id override pushing the outer to 130 since it's the gravitational centre of the map.
- **Halo-aware ambient placement.** While ambient web was still in the renderer, the generator skipped any clump landing within `~halo.radius * 0.6` of any halo centre. That pattern survived into the BG-mask above even after the ambient web itself was removed.
- **Stronger nebula tints over re-layout for "grouping clarity".** When the user asked for clearer halo grouping, nebula alphas were bumped ~50% and hues pushed toward more saturated forms (research `#6E1838 @0.78`, infrastructure `#4F1E68 @0.78`, etc.). Cheaper and less disruptive than re-positioning halos.
- **Locked halos: dashed boundary + padlock glyph, no interior darkening.** First attempt darkened the locked halo interior to convey "sealed". Read as muddy. Replaced with v8's pattern: dashed boundary + the padlock glyph itself. The personal-private halo renders on the public map; the Anthropic-fellowship halo stays hidden (status `dormant`) until applied.
- **No PixiJS dependency.** v0 doesn't need animation, zoom, or pan. Vanilla Canvas was sufficient and saved ~300KB of bundle. Reconsider for v1+ if cockpit interactions get richer.

### v1 — Month 1-2 (the cockpit, first integration, first agent)

**Goal:** add auth, the private cockpit, and prove end-to-end that one tool integration and one agent dispatch works.

**Status (2026-05-17): in progress.** Sub-phases planned in `docs/V1_PLAN.md`:

- v1.1 ✅ shipped — Supabase schema + JSON→DB seed pipeline
- v1.2 ✅ shipped — Supabase Auth (magic-link) + protected `/cockpit` showing all 19 halos
- v1.2.1 ✅ shipped — switched magic-link → email+password (Gmail's link-prefetcher kept consuming the OTP)
- v1.3 ⏳ next — `/cockpit/[halo-id]` panel skeleton (four zones, empty states, click-through from cockpit map)
- v1.4 ⏳ — first integration: **GitHub via PAT** (replaced Todoist because the Todoist developer console UI was harder to navigate; integration architecture is identical)
- v1.5 ⏳ — Modal + FastAPI + first on-demand agent on thesis
- v1.6 ⏳ — activity-driven brightness on the cockpit map (Thesis-only in v1)

Decisions that overrode this section's original spec:
- **Auth: Supabase Auth, not Clerk** (V1_PLAN A1)
- **First integration: GitHub PAT, not Todoist OAuth** (operational call during prereqs)
- **Production domain: stay on `atlas-rust-one.vercel.app`** — custom domain deferred (V1_PLAN A3)

Deliverables (original list, kept for reference):
- ~~Clerk~~ Supabase Auth wired in. Sign-in route, proxy protecting `/cockpit/*`.
- Supabase database deployed with the schema from §5.
- Halos seeded from JSON into Supabase.
- `/cockpit` route: same map but full halo set.
- `/cockpit/[halo-id]` route: command panel skeleton with the four zones.
- **One integration end-to-end:** ~~Todoist~~ GitHub. PAT in env, config UI per halo, commits/PRs/issues rendered in the activity feed.
- **One agent type end-to-end:** on-demand task. FastAPI deployed to Modal, one preloaded agent ("draft an email reply") for one halo (thesis), streaming response in the command panel.
- Agent run history persisted to `agent_runs`.

Success criterion: Andreas can sign in, open the thesis halo, see recent activity from his configured GitHub repos for that project, and dispatch a "draft email" agent that returns useful output preloaded with thesis context.

### v2 — Month 3-4 (the real cockpit)

**Goal:** add the remaining integrations and the persistent monitor layer.

Deliverables:
- Gmail integration (after migration from Mac Mail).
- Google Calendar integration.
- GitHub integration.
- Zotero integration.
- Slack and Discord integrations.
- arxiv-watcher monitor running on the research halos.
- slurm-watcher monitor.
- email-triage monitor producing the morning digest.
- Notification piping to Discord.

Success criterion: opening a research halo shows live activity from 5+ tools; the morning Discord digest lands at 9 AM with arxiv + email + SLURM summary.

### v3 — Month 5-6 (workflows + semantic layout)

**Goal:** the multi-step workflows + auto-layout via embeddings.

Deliverables:
- Workflow runtime on Modal with checkpoint persistence.
- Paper-figure regenerator workflow.
- Trip-prep checklist workflow.
- Semantic layout: project descriptions embedded via `text-embedding-3-small`, stored in pgvector, halo positions recomputed via UMAP — but only as a "suggested layout" overlay. The user can accept or revert.

Success criterion: Andreas launches a multi-hour workflow from a halo, walks away, comes back to a draft PR and a Discord ping.

### Ongoing

New project → new halo (single JSON edit, hot reloads). New agent idea → new row in `halo_agents`. The system grows by accumulation.

---

## 12. Open decisions

Marked open because they were not nailed down in the design conversation. Decide before building.

1. **Domain name for production.** Atlas needs a URL. Options: `atlas.tersenov.dev`, `tersenov.dev/atlas`, or roll into a single `tersenov.dev` with the map as the homepage. **Recommendation:** the map IS the homepage of the main personal site. *(Still open after v0 — preview deployed to a generated Vercel URL pending the canonical domain decision.)*
2. **Clerk pricing.** Clerk is free up to 10K MAU but it's worth knowing the price ramps. Atlas will have ≤5 users probably ever (Andreas, maybe a partner, maybe a couple of trusted collaborators in the long-term). Worth checking if Supabase Auth is sufficient.
3. **Modal vs Railway.** Modal is the recommendation, but if Andreas wants more predictable monthly costs and is OK with always-on servers, Railway is simpler. Decide before v1.
4. ~~**What's in the personal-private cluster.**~~ **Resolved by v0:** kept as a single placeholder halo (status `locked`, dashed boundary + padlock glyph), rendered on the public map. Sub-map can be revisited in v1+ if the cluster grows.
5. **Mac Notes migration target.** Keep Mac Notes? Migrate to Obsidian / a custom note system? Recommendation: keep Mac Notes for now, integrate later if it becomes friction.
6. ~~**The Anthropic STEM fellowship halo.**~~ **Resolved by v0:** omitted from the public layer (status `dormant`, no position rendered). Will appear in the cockpit when applied.

### New open decisions surfaced during v0

7. **Glyph parameterisation vs. per-halo bespoke.** Glyphs scale by `s = halo.r / Rsvg` from the v8 SVG's canonical halo radius. The smallest halos (r=18-22 — Anthropic, l1-emulator, browser-window) end up with visibly compressed glyphs. Decide whether to (a) add per-halo glyph-radius overrides (the glyph draws at a fixed minimum size regardless of halo radius), (b) author each glyph at multiple resolutions, or (c) bump the smallest halo radii to ≥24 in the data.
8. **Aesthetic principles binding for v1+.** v0 deviated from §3 in two material ways: dropped the ambient cosmic web entirely, and removed the named-junction blooms. The cleaner look was driven by user feedback during this implementation pass. Decide whether the cockpit (v1) returns to the v8-style dense-web rendering (more "alive", more visual noise) or stays with the v0 cleaner aesthetic. If v0's cleanups are binding, **§3 should be amended** to reflect them.
9. **AstroStat seat-row symmetry.** The v8 SVG biases the lecture-hall seats to the right; v0 centred them symmetrically on user request. Document whether v0's symmetric form is the canonical pattern or whether other glyphs should also deviate from v8 where v8 has incidental asymmetry.
10. **v1 hover behaviour.** v0 hover just brightens the halo. Decide v1 hover semantics: tooltip with description, highlight connected filaments, fade unrelated halos, etc.
11. **What goes in `/p/[halo-id]` (public detail pages).** Spec mentions "paper links, descriptions, status" but doesn't specify the layout. v0 stubs out the click handler with `console.log`; v1 needs a content schema for the per-halo public page (likely an MDX file per halo or a `description_long` markdown field already in the schema).

---

## 13. First Claude Code session

The initial prompt to open with:

> Read `docs/ATLAS_HANDOFF.md` and `references/atlas_cosmic_web_v8.svg`. Implement v0 of Atlas per §11: the public-facing cosmic web map.
>
> Stack: Next.js (App Router) + React + TypeScript + Tailwind. Render the map with HTML5 Canvas inside a React component. Do not use SVG for the map itself — the complexity is too high. The v8 SVG is a visual reference; reimplement its rendering in Canvas.
>
> Seed all 18 halos and all filaments in JSON files at `data/halos.json` and `data/filaments.json`, with positions and connections per §6 and §7 of the handoff.
>
> Build the rendering in distinct layers (background, nebula tints, particle field, ambient cosmic web, inter-halo filaments, knots, junctions, halos, domain labels, title chrome) — separate functions per layer, called in z-order.
>
> Halos are clickable but for v0 the click handler just logs the halo id to console. Hover state should brighten the halo subtly.
>
> Restore the two things dropped in v8: (a) the faint dashed cross-cluster connections from §7, (b) the domain labels in monospace caps positioned in the corners of each region.
>
> Deploy target is Vercel as a static site. No backend, no auth, no Supabase, no agents in this session. Just the beautiful map.
>
> Take aesthetic principles in §3 as binding. Especially: filaments are matter chains of overlapping ellipses, not dotted strokes; ambient web goes in all directions, not horizontal-biased; halos are embedded with fuzzy haze and sharp glyphs.
>
> Before writing code, propose the file structure and the rendering-function signatures. I'll review and approve before you implement.

---

## Appendix A — File structure (proposed)

```
atlas/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # public map
│   ├── p/[haloId]/page.tsx          # public halo detail
│   ├── cockpit/                     # v1+: behind auth
│   │   ├── page.tsx
│   │   └── [haloId]/page.tsx
│   └── api/                         # v1+
│       └── agents/dispatch/route.ts
├── components/
│   ├── CosmicWebMap/
│   │   ├── index.tsx                # the React component
│   │   ├── renderer.ts              # the Canvas rendering layers
│   │   ├── glyphs.ts                # the glyph drawing functions
│   │   ├── colors.ts                # palette constants
│   │   └── types.ts
│   └── ui/                          # shared components
├── data/
│   ├── halos.json
│   └── filaments.json
├── lib/
│   └── utils.ts
├── references/
│   └── atlas_cosmic_web_v8.svg      # the visual target
├── docs/
│   └── ATLAS_HANDOFF.md             # this document
├── public/
├── package.json
└── tailwind.config.ts
```

---

*Last updated 2026-05-14. Update this document when you change architecture or settle an open decision.*
