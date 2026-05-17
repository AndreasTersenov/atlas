"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

// useSearchParams forces this branch into a client suspense boundary, so the
// page wrapper provides the fallback while the params hook resolves.
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInShell />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInShell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0A0214] px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-xs uppercase tracking-[0.3em] text-[#A878B0] hover:text-[#D4BCE6]"
        >
          ← Atlas
        </Link>
        <div className="rounded-lg border border-[#3F2570] bg-[#13062A] p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </main>
  );
}

function SignInForm() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const params = useSearchParams();
  const next = params.get("next") ?? "/cockpit";
  const errorParam = params.get("error");

  async function handleSubmit(formData: FormData) {
    const email = (formData.get("email") as string)?.trim();
    if (!email) return;
    setState({ kind: "sending" });
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    setState({ kind: "sent", email });
  }

  return (
    <SignInShell>
      <h1 className="mb-2 text-xl font-medium text-[#E8D6F4]">
        Sign in to Atlas
      </h1>
      <p className="mb-6 text-sm text-[#A878B0]">
        Enter your email to receive a magic link. Allow-listed accounts only.
      </p>

      {state.kind === "sent" ? (
        <div className="rounded-md border border-[#5BB8C4]/40 bg-[#5BB8C4]/10 p-4 text-sm text-[#A8DAE0]">
          <p className="font-medium">Check your inbox.</p>
          <p className="mt-1 text-[#A8DAE0]/80">
            We sent a magic link to <strong>{state.email}</strong>. Click it to
            sign in.
          </p>
        </div>
      ) : (
        <form action={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-[#A878B0]">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="email"
              disabled={state.kind === "sending"}
              className="w-full rounded-md border border-[#3F2570] bg-[#0A0214] px-3 py-2 text-sm text-[#E8D6F4] outline-none focus:border-[#9B6BC4] disabled:opacity-50"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={state.kind === "sending"}
            className="w-full rounded-md bg-[#9B6BC4] px-3 py-2 text-sm font-medium text-[#0A0214] transition-colors hover:bg-[#C5A8DC] disabled:opacity-50"
          >
            {state.kind === "sending" ? "Sending…" : "Send magic link"}
          </button>

          {state.kind === "error" && (
            <p className="text-sm text-[#E04880]">{state.message}</p>
          )}
          {errorParam === "auth_failed" && state.kind === "idle" && (
            <p className="text-sm text-[#E04880]">
              That link expired or was already used. Request a new one.
            </p>
          )}
        </form>
      )}
    </SignInShell>
  );
}
