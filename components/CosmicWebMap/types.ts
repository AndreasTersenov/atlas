// Halo + Filament types are now defined as zod schemas in lib/halo-schema.ts
// (single source of truth, shared by runtime validation and scripts/seed.ts).
// This file re-exports them so existing imports keep working, and adds the
// renderer-local Junction type.

export type {
  Domain,
  Filament,
  GlyphType,
  Halo,
  Status,
  Strength,
} from "@/lib/halo-schema";

export interface Junction {
  id: string;
  x: number;
  y: number;
  intensity: number;
}
