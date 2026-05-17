// Admin Supabase client — service-role key, bypasses RLS, no auth context.
//
// Use this for trusted server scripts and admin actions that need to write
// across users (scripts/seed.ts, future user-management actions, the Modal
// agent runtime writing agent_runs). DO NOT use for normal Next.js server
// components — those should use lib/supabase-server.ts (cookie-bound, anon
// key, respects RLS).
//
// Also works around `@supabase/realtime-js` requiring a native WebSocket:
// Node < 22 doesn't have one, so the default `createClient(...)` crashes on
// Node 20 even when realtime isn't used. We pass the `ws` package as the
// realtime transport so the client constructs cleanly. Vercel production
// runs Node 22+ where this is a no-op; local dev on Node 20 needs the shim.

import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Database } from "./database.types";

export function createAdminClient(
  url: string,
  serviceRoleKey: string,
  extra: SupabaseClientOptions<"public"> = {}
): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
    ...extra,
  });
}
