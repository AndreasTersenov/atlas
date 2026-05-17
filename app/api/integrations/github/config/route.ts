import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase-server";

const Body = z.object({
  haloId: z.string().min(1),
  // GitHub repo names are "owner/name"; we just sanity-check the shape, not
  // existence — the user picked these from a list the server returned.
  repos: z
    .array(z.string().regex(/^[^/]+\/[^/]+$/, "expected owner/name"))
    .min(1)
    .max(50),
});

// POST /api/integrations/github/config
// Upserts a halo_integrations row keyed on (owner_id, halo_id, provider='github').
// RLS handles the auth.uid()=owner_id check; we pass the user id explicitly so
// the upsert succeeds on the first INSERT.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { haloId, repos } = parsed.data;

  // Sanity-check the halo id exists. UX guard only: halos has a world-readable
  // RLS policy (per V1_PLAN A10 — same structural rows for every user), so this
  // is not an auth boundary. The upsert below binds the row to user.id, which
  // IS where ownership lives. Revisit if v2+ introduces per-user halos.
  const { data: halo, error: haloError } = await supabase
    .from("halos")
    .select("id")
    .eq("id", haloId)
    .maybeSingle();
  if (haloError) {
    console.error("[github] halo lookup failed:", haloError);
    return NextResponse.json({ error: "halo_lookup_failed" }, { status: 500 });
  }
  if (!halo) {
    return NextResponse.json({ error: "halo_not_found" }, { status: 404 });
  }

  const { error: upsertError } = await supabase.from("halo_integrations").upsert(
    {
      owner_id: user.id,
      halo_id: haloId,
      provider: "github",
      config: { repos },
    },
    { onConflict: "owner_id,halo_id,provider" }
  );
  if (upsertError) {
    console.error("[github] halo_integrations upsert failed:", upsertError);
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
