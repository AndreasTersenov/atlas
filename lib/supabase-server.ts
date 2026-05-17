// Server-side Supabase client factory.
//
// Works around `@supabase/realtime-js` requiring a native WebSocket: Node < 22
// doesn't have one, so the default `createClient(...)` crashes on Node 20 even
// when realtime isn't used. We pass the `ws` package as the realtime transport
// so the client constructs cleanly. Vercel production runs Node 22+ where this
// is a no-op; local dev on Node 20 needs the shim.
//
// Use with the service-role key for bypass-RLS writes (scripts/seed.ts, admin
// server actions). Use with the anon key for normal server-component reads.

import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import WebSocket from "ws";

export function createServerClient(
  url: string,
  key: string,
  extra: SupabaseClientOptions<"public"> = {}
): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
    ...extra,
  });
}
