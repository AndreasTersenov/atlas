import { redirect } from "next/navigation";
import CosmicWebMap from "@/components/CosmicWebMap";
import { createServerClient } from "@/lib/supabase-server";
import {
  FilamentsArray,
  HalosArray,
  validateFilamentEndpoints,
} from "@/lib/halo-schema";

// Cookies are read per-request → page must be dynamic.
export const dynamic = "force-dynamic";

export default async function Cockpit() {
  const supabase = await createServerClient();

  // Belt-and-braces: the proxy already redirected unauthenticated requests,
  // but double-check here so a broken proxy config can't accidentally expose
  // cockpit data. Carry the original target through so re-auth lands back.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/cockpit")}`);

  const [haloResult, filamentResult] = await Promise.all([
    supabase.from("halos").select("*"),
    supabase.from("filaments").select("*"),
  ]);

  if (haloResult.error || filamentResult.error) {
    throw new Error(
      `Failed to load cockpit data: ${
        haloResult.error?.message ?? filamentResult.error?.message
      }`
    );
  }

  // Validate at the Next.js → renderer boundary. Catches DB-vs-zod drift.
  const halos = HalosArray.parse(haloResult.data);
  const filaments = FilamentsArray.parse(filamentResult.data);
  const xref = validateFilamentEndpoints(halos, filaments);
  if (!xref.ok) {
    throw new Error(
      `Filaments reference unknown halo ids: ${xref.missing.join(", ")}`
    );
  }

  return (
    <main className="relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#0A0214] p-2 sm:p-4">
      <CosmicWebMap halos={halos} filaments={filaments} />

      {/* Cockpit chrome: signed-in indicator + sign-out */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex w-full items-start justify-between p-3 text-xs sm:p-4">
        <div className="pointer-events-auto rounded-md border border-[#3F2570]/50 bg-[#13062A]/70 px-3 py-1.5 font-mono text-[#A878B0] backdrop-blur">
          cockpit · {user.email}
        </div>
        <form
          action="/auth/sign-out"
          method="POST"
          className="pointer-events-auto"
        >
          <button
            type="submit"
            className="rounded-md border border-[#3F2570]/50 bg-[#13062A]/70 px-3 py-1.5 font-mono text-[#A878B0] backdrop-blur transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
          >
            sign out
          </button>
        </form>
      </div>
    </main>
  );
}
