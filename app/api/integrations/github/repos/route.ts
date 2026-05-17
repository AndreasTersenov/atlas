import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { listMyRepos } from "@/lib/github";

// GET /api/integrations/github/repos
// Returns the list of repos owned-by or collaborator-on the GITHUB_PAT user,
// for the ConfigureGitHub multi-select. Auth required — the PAT must not be
// leaked to unauthenticated callers, even though it's a personal token.
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const repos = await listMyRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: "github_fetch_failed", message },
      { status: 502 }
    );
  }
}
