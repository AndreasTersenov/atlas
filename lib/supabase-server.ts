// Server-side Supabase client for Next.js server components and route handlers.
//
// Uses the anon key plus a cookie-bound session, so RLS policies (`auth.uid()
// = owner_id`) apply correctly for the signed-in user. This is the normal
// "fetch from Supabase in an RSC" client.
//
// For trusted scripts that need to bypass RLS (seeding, admin actions),
// use lib/supabase-admin.ts instead.

import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function createServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  return createSSRServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Setting cookies from a Server Component throws — that's fine,
            // the Next.js proxy (proxy.ts) handles session refresh on the
            // next request.
          }
        },
      },
    }
  );
}
