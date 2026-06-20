// Build-time helpers for the v2 per-halo content pipeline.
//
// Source-of-truth split (V2_SHOWCASE_PLAN.md §I, resolved per
// V2_PLAN_REVIEW.md §2.7):
//
//   data/halos.json           — canonical for map presence (position,
//                                radius, glyph, domain, status)
//   content/halos/<id>.mdx    — canonical for page metadata (title,
//                                tagline, link list, explainer config)
//
// Drift checks split between two layers:
//   • `listMdxHaloIds()` (this file) — enforces that every MDX
//     filename id under content/halos/ exists in data/halos.json.
//     Runs once per build via generateStaticParams. Throws on drift.
//   • app/p/[haloId]/page.tsx (per-page) — enforces that each MDX
//     file's frontmatter `halo_id` matches the URL segment / filename
//     it was loaded from. Runs at build time per static path. Catches
//     the case where the filename and frontmatter disagree (e.g. a
//     copy-pasted file that wasn't fully renamed).
//
// Halos in data/halos.json without an MDX file are tolerated; their
// /p/<id> route 404s deliberately until written.

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Live-imported so the file location stays in one place; this is also
// a Node-only module so direct fs work is fine.
import halosJson from "@/data/halos.json";

// ─── frontmatter schema ───────────────────────────────────────────────

export const HaloLink = z.object({
  kind: z.enum(["github", "paper", "slides", "page", "talk", "other"]),
  href: z.string().url(),
  label: z.string().min(1),
});
export type HaloLink = z.infer<typeof HaloLink>;

export const HaloFrontmatter = z.object({
  halo_id: z.string().regex(/^[a-z0-9-]+$/, "lowercase kebab-case"),
  title: z.string().min(1),
  tagline: z.string().min(1),
  links: z.array(HaloLink).default([]),
  related_halos: z.array(z.string()).default([]),
  // Explainer wiring lands in G.1.c when <RevealExplainer> exists.
  explainer: z
    .object({
      module: z.string(),
      attach: z.string(),
      kind: z.string(),
      acts: z.number().int().positive(),
    })
    .optional(),
});
export type HaloFrontmatter = z.infer<typeof HaloFrontmatter>;

// ─── halo-id discovery + coherence check ──────────────────────────────

const CONTENT_DIR = path.join(process.cwd(), "content", "halos");

const halosJsonIds = new Set<string>(
  (halosJson as ReadonlyArray<{ id: string }>).map((h) => h.id)
);

/**
 * Lists halo ids that have an MDX file under content/halos/. Throws if
 * any of them isn't present in data/halos.json — that's the
 * content-authority drift case the plan calls a build-time failure.
 */
export async function listMdxHaloIds(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(CONTENT_DIR);
  } catch (err) {
    // content/halos/ doesn't exist yet (first-run, no halo content written)
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const ids = entries
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));

  const missing = ids.filter((id) => !halosJsonIds.has(id));
  if (missing.length > 0) {
    throw new Error(
      `[halo-content] MDX files reference halo ids not in data/halos.json: ${missing.join(", ")}. ` +
        "Either add the halo to halos.json (map presence) or rename the MDX file. " +
        "See V2_SHOWCASE_PLAN.md §I."
    );
  }

  return ids;
}
