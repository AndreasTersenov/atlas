// Browser-side Supabase client for Next.js client components.
//
// Uses the anon key. Session is read from cookies set by the server-side
// auth flow (sign-in callback). Use this in client components that need to
// trigger auth actions (signInWithOtp, signOut) or perform RLS-scoped reads
// from the browser.

import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createBrowserClient(): SupabaseClient<Database> {
  return createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
