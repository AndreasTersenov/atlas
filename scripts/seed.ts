/**
 * Seeds the Supabase `halos` and `filaments` tables from data/*.json.
 *
 * Source of truth: data/halos.json + data/filaments.json. This script is
 * idempotent — re-runs upsert the same rows. Run after each JSON edit:
 *
 *   npm run db:seed              # upsert only
 *   npm run db:seed -- --prune   # also delete halos/filaments not in JSON
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (NOT the anon key — RLS would block writes from it).
 */

import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FilamentsArray,
  HalosArray,
  validateFilamentEndpoints,
  validateUniqueFilaments,
} from "../lib/halo-schema";
import { createServerClient } from "../lib/supabase-server";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const prune = process.argv.includes("--prune");

const supabase = createServerClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(rel), "utf-8")) as T;
}

async function main() {
  // 1. Load + validate
  const halosRaw = loadJson<unknown>("data/halos.json");
  const filamentsRaw = loadJson<unknown>("data/filaments.json");
  const halos = HalosArray.parse(halosRaw);
  const filaments = FilamentsArray.parse(filamentsRaw);

  const xref = validateFilamentEndpoints(halos, filaments);
  if (!xref.ok) {
    console.error("Filaments reference unknown halo ids:", xref.missing);
    process.exit(1);
  }

  const uniq = validateUniqueFilaments(filaments);
  if (!uniq.ok) {
    console.error(
      "Duplicate filaments (composite key from+to+kind must be unique):",
      uniq.duplicates
    );
    process.exit(1);
  }

  console.log(`Validated ${halos.length} halos + ${filaments.length} filaments`);

  // 2. Upsert halos
  const { error: haloErr } = await supabase
    .from("halos")
    .upsert(halos, { onConflict: "id" });
  if (haloErr) {
    console.error("halos upsert failed:", haloErr);
    process.exit(1);
  }
  console.log(`✓ upserted ${halos.length} halos`);

  // 3. Upsert filaments
  // Composite unique (from_halo_id, to_halo_id, kind) per the migration.
  const { error: filErr } = await supabase
    .from("filaments")
    .upsert(filaments, { onConflict: "from_halo_id,to_halo_id,kind" });
  if (filErr) {
    console.error("filaments upsert failed:", filErr);
    process.exit(1);
  }
  console.log(`✓ upserted ${filaments.length} filaments`);

  // 4. Optional prune
  if (prune) {
    // Halos: delete any row whose id isn't in the JSON. Guard against an
    // empty halos.json — building `not in ()` would either error or wipe
    // the table, both bad. If JSON is empty, require an explicit nuke.
    if (halos.length === 0) {
      console.error(
        "Refusing to prune with halos.length === 0. " +
          "If you really mean 'delete everything', do it manually in the dashboard."
      );
      process.exit(1);
    }
    const haloIds = halos.map((h) => h.id);
    const { error: pruneHaloErr, count: prunedHalos } = await supabase
      .from("halos")
      .delete({ count: "exact" })
      .not("id", "in", `(${haloIds.map((id) => `'${id}'`).join(",")})`);
    if (pruneHaloErr) {
      console.error("halo prune failed:", pruneHaloErr);
      process.exit(1);
    }
    console.log(`✓ pruned ${prunedHalos ?? 0} halos not in JSON`);

    // Filaments: cascade-delete handles rows whose endpoints disappeared,
    // but it doesn't help when a filament is removed from JSON while both
    // endpoints still exist. Match the JSON set and delete the rest.
    // We pull current rows, compute the diff in JS (PostgREST has no clean
    // way to filter on a composite NOT IN), then delete by id.
    const { data: liveFilaments, error: liveErr } = await supabase
      .from("filaments")
      .select("id, from_halo_id, to_halo_id, kind");
    if (liveErr) {
      console.error("filament fetch (for prune) failed:", liveErr);
      process.exit(1);
    }
    const wantedKeys = new Set(
      filaments.map((f) => `${f.from_halo_id}|${f.to_halo_id}|${f.kind}`)
    );
    const orphanIds = (liveFilaments ?? [])
      .filter(
        (row) =>
          !wantedKeys.has(`${row.from_halo_id}|${row.to_halo_id}|${row.kind}`)
      )
      .map((row) => row.id as string);
    if (orphanIds.length > 0) {
      const { error: pruneFilErr } = await supabase
        .from("filaments")
        .delete()
        .in("id", orphanIds);
      if (pruneFilErr) {
        console.error("filament prune failed:", pruneFilErr);
        process.exit(1);
      }
    }
    console.log(`✓ pruned ${orphanIds.length} filaments not in JSON`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
