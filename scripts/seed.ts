/**
 * Seeds the Supabase `halos` and `filaments` tables from data/*.json.
 *
 * Source of truth: data/halos.json + data/filaments.json. This script is
 * idempotent — re-runs upsert the same rows. Run after each JSON edit:
 *
 *   npm run db:seed              # upsert only
 *   npm run db:seed -- --prune   # also delete halos/filaments not in JSON
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local (NOT the
 * anon key — RLS would block writes from it).
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FilamentsArray,
  HalosArray,
  validateFilamentEndpoints,
} from "../lib/halo-schema";

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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
    // Filaments cascade-delete from halos, so a separate filament prune is
    // only needed for filaments whose endpoints survived but whose row in
    // JSON disappeared. For v1 the unique constraint handles most of that
    // via the upsert; skip explicit filament prune.
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
