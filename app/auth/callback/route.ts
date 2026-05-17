// Magic-link callback. Supabase sends the user here after they click the
// link in the email. We exchange the OTP code for a real session, set the
// session cookies, and redirect to wherever they were trying to go.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { safeNext } from "@/lib/safe-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Sanitise — without this `?next=https://evil.com` would be honoured as a
  // post-auth redirect (open-redirect vulnerability).
  const next = safeNext(url.searchParams.get("next"));

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
