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

  // Sanity-check the halo id exists. Cheap, and returning a 400 here beats
  // letting Postgres FK-fail with a less helpful message.
  const { data: halo, error: haloError } = await supabase
    .from("halos")
    .select("id")
    .eq("id", haloId)
    .maybeSingle();
  if (haloError) {
    return NextResponse.json(
      { error: "halo_lookup_failed", message: haloError.message },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: "upsert_failed", message: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
