import CosmicWebMap from "@/components/CosmicWebMap";
import filaments from "@/data/filaments.json";
import halos from "@/data/halos.json";
import type { Filament, Halo } from "@/components/CosmicWebMap/types";

export default function Home() {
  // Public layer: include is_public halos plus locked placeholders (which render
  // as visible-but-sealed padlocks per the handoff). The Anthropic fellowship
  // (status: dormant) stays hidden until applied.
  const publicHalos = (halos as Halo[]).filter(
    (h) => h.is_public || h.status === "locked"
  );
  const publicIds = new Set(publicHalos.map((h) => h.id));
  const publicFilaments = (filaments as Filament[]).filter(
    (f) => publicIds.has(f.from_halo_id) && publicIds.has(f.to_halo_id)
  );

  return (
    <main className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#0A0214] p-2 sm:p-4">
      <CosmicWebMap halos={publicHalos} filaments={publicFilaments} />
    </main>
  );
}
