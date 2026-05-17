// Magic-link callback. Supabase sends the user here after they click the
// link in the email. We exchange the OTP code for a real session, set the
// session cookies, and redirect to wherever they were trying to go.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/cockpit";

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_failed", url.origin)
    );
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_failed", url.origin)
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
