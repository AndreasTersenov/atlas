// Single source of truth for the Halo + Filament data shape.
// Used at runtime (validating JSON loads, parsing DB rows) and by scripts/seed.ts.
// If you add a field, update both this schema and supabase/migrations/000N_*.sql.

import { z } from "zod";

export const Domain = z.enum([
  "research",
  "career",
  "infrastructure",
  "teaching",
  "personal",
  "bronze",
]);
export type Domain = z.infer<typeof Domain>;

export const Status = z.enum(["active", "dormant", "completed", "locked"]);
export type Status = z.infer<typeof Status>;

export const Strength = z.enum(["primary", "medium", "faint"]);
export type Strength = z.infer<typeof Strength>;

export const GlyphType = z.enum([
  "thesis_dag_lens",
  "cnn_stack",
  "wavelet_quadtree",
  "transport_plan",
  "input_cnn_output",
  "method_grid_3x3",
  "posterior_contours",
  "mlp_small",
  "survey_patch",
  "podium_panel",
  "rotunda",
  "pins_flight_arc",
  "browser_window",
  "node_tree",
  "paper_highlight",
  "classroom_seating",
  "stopwatch_3min",
  "padlock",
]);
export type GlyphType = z.infer<typeof GlyphType>;

// Optional fields use `.nullish()` (= `.optional().nullable()`) because the
// data can arrive two ways:
//   * from data/*.json — missing key → `undefined`
//   * from Supabase    — nullable column → JS `null`
// Both need to be accepted; a plain `.optional()` rejects null and breaks the
// cockpit page that reads from Postgres.

export const HaloSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "lowercase kebab-case"),
  name: z.string().min(1),
  domain: Domain,
  description: z.string(),
  description_long: z.string().nullish(),
  is_public: z.boolean(),
  position_x: z.number(),
  position_y: z.number(),
  radius: z.number().positive(),
  glyph_type: GlyphType,
  status: Status,
});
export type Halo = z.infer<typeof HaloSchema>;

export const FilamentSchema = z.object({
  from_halo_id: z.string().min(1),
  to_halo_id: z.string().min(1),
  strength: Strength,
  kind: z.string().min(1),
  description: z.string().nullish(),
  via_junction: z.string().nullish(),
});
export type Filament = z.infer<typeof FilamentSchema>;

export const HalosArray = z.array(HaloSchema);
export const FilamentsArray = z.array(FilamentSchema);

// Cross-file invariant: every filament endpoint must resolve to a halo id.
export function validateFilamentEndpoints(
  halos: Halo[],
  filaments: Filament[]
): { ok: true } | { ok: false; missing: string[] } {
  const ids = new Set(halos.map((h) => h.id));
  const missing: string[] = [];
  for (const f of filaments) {
    if (!ids.has(f.from_halo_id)) missing.push(`from:${f.from_halo_id}`);
    if (!ids.has(f.to_halo_id)) missing.push(`to:${f.to_halo_id}`);
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

// Schema invariant: (from_halo_id, to_halo_id, kind) is the composite unique
// key in the DB. Mirror that in JSON so duplicates are caught at validate
// time, not at upsert time (clearer error than Postgres error 21000).
export function validateUniqueFilaments(
  filaments: Filament[]
): { ok: true } | { ok: false; duplicates: string[] } {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const f of filaments) {
    const key = `${f.from_halo_id} → ${f.to_halo_id} (${f.kind})`;
    if (seen.has(key)) dupes.push(key);
    else seen.add(key);
  }
  return dupes.length ? { ok: false, duplicates: dupes } : { ok: true };
}
