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

// Per-halo activity score from session recency. 0..1; sessions seen "now"
// score 1.0, fade linearly to 0 over the next hour. Pulled out of the page
// function so the React-purity lint doesn't flag the per-row mutation
// inside a server-component render path.
const ACTIVITY_WINDOW_MS = 60 * 60 * 1000;
function computeActivityScores(
  rows: Array<{ halo_id: string | null; last_seen: string }>
): Record<string, number> {
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!row.halo_id) continue;
    if (out[row.halo_id] !== undefined) continue;
    const ageMs = now - new Date(row.last_seen).getTime();
    out[row.halo_id] = Math.max(0, Math.min(1, 1 - ageMs / ACTIVITY_WINDOW_MS));
  }
  return out;
}

export default async function Cockpit() {
  const supabase = await createServerClient();

  // Belt-and-braces: the proxy already redirected unauthenticated requests,
  // but double-check here so a broken proxy config can't accidentally expose
  // cockpit data. Carry the original target through so re-auth lands back.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/cockpit")}`);

  const [haloResult, filamentResult, sessionsResult] = await Promise.all([
    supabase.from("halos").select("*"),
    supabase.from("filaments").select("*"),
    // Latest session per halo. RLS scopes to the current user, so this is
    // their cross-machine activity only.
    supabase
      .from("claude_sessions")
      .select("halo_id, last_seen")
      .not("halo_id", "is", null)
      .order("last_seen", { ascending: false }),
  ]);

  if (haloResult.error || filamentResult.error) {
    throw new Error(
      `Failed to load cockpit data: ${
        haloResult.error?.message ?? filamentResult.error?.message
      }`
    );
  }
  if (sessionsResult.error) {
    throw new Error(
      `Failed to load Claude sessions: ${sessionsResult.error.message}`
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

  // Compute per-halo activity in [0, 1] from session recency: a session
  // last seen now → 1.0, fading linearly to 0 over the next ACTIVITY_WINDOW.
  // Halos with no session activity get nothing → renderer treats as 0.
  // Sessions are sorted last_seen DESC, so first row per halo wins.
  const activityByHaloId = computeActivityScores(sessionsResult.data ?? []);

  return (
    <main className="relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#0A0214] p-2 sm:p-4">
      <CosmicWebMap
        halos={halos}
        filaments={filaments}
        linkPrefix="/cockpit/"
        activityByHaloId={activityByHaloId}
      />

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
