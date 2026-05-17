// Next.js proxy (formerly "middleware" pre-Next 16): guards /cockpit/* routes.
//
// 1. For every cockpit request, instantiate a Supabase SSR client wired to
//    the request/response cookie pair so session-refresh cookies propagate
//    back to the browser.
// 2. Call supabase.auth.getUser() — this verifies the access token by hitting
//    Supabase Auth (don't substitute getSession() which trusts the cookie).
// 3. If no user, redirect to /sign-in with a `next` query param so the
//    callback can send them back where they were trying to go.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Preserve the full original path+search so deep links to e.g.
    // /cockpit/thesis?tab=runs survive the sign-in round-trip.
    const original =
      request.nextUrl.pathname + (request.nextUrl.search ?? "");
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", original);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/cockpit/:path*"],
};
