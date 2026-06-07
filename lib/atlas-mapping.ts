// Per-machine mapping config: glob patterns over cwd → halo_id.
//
// Lives at ~/.atlas/mapping.json on each machine. Paths differ between
// macbook and the HPCs, so this file is machine-local (not in
// dotfiles-claude). The bridge loads it once at startup, matches each
// Claude session's cwd against the rule list in order, and the first
// match wins.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import picomatch from "picomatch";
import { z } from "zod";

export const MappingSchema = z
  .object({
    owner_email: z.string().email(),
    halos: z
      .array(
        z.object({
          pattern: z.string().min(1),
          halo_id: z.string().min(1),
        })
      )
      .default([]),
  })
  // Accept unknown keys so docs/mapping.example.json's `_comment` (and any
  // future non-semantic metadata) doesn't crash the bridge on first load.
  .passthrough();

export type Mapping = z.infer<typeof MappingSchema>;

export const DEFAULT_MAPPING_PATH = resolve(homedir(), ".atlas", "mapping.json");

export function loadMapping(path: string = DEFAULT_MAPPING_PATH): Mapping {
  const raw = readFileSync(path, "utf-8");
  return MappingSchema.parse(JSON.parse(raw));
}

// Resolve a cwd to a halo_id by walking the rule list in order. picomatch
// matches the same glob syntax as gitignore-style patterns: `**` for
// recursive directory matching, `*` for one segment. A pattern without `**`
// matches the cwd exactly; with `**` it matches the directory and anything
// beneath it (i.e. write `/path/to/halo/**` for "halo dir or any subdir").
export function resolveHalo(cwd: string, mapping: Mapping): string | null {
  for (const rule of mapping.halos) {
    if (picomatch.isMatch(cwd, rule.pattern)) {
      return rule.halo_id;
    }
  }
  return null;
}
