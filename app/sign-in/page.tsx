"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import { safeNext } from "@/lib/safe-next";

type Mode = "sign-in" | "sign-up";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "needs-confirmation"; email: string }
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
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  // The callback route still redirects here with ?error=auth_failed when a
  // password-reset or future OAuth flow fails. Surface it once on initial
  // load so the user knows why they landed back on the form.
  const errorParam = params.get("error");
  const [mode, setMode] = useState<Mode>("sign-in");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleSubmit(formData: FormData) {
    const email = (formData.get("email") as string)?.trim();
    const password = formData.get("password") as string;
    if (!email || !password) return;

    setState({ kind: "submitting" });
    const supabase = createBrowserClient();
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      // Allow-list trigger from v1.1 raises with errcode 42501 — surface a
      // friendlier message than Supabase's default for that case.
      const msg = /allow-list/i.test(result.error.message)
        ? "That email isn't allowed to sign up."
        : result.error.message;
      setState({ kind: "error", message: msg });
      return;
    }

    // signUp returns success *without* a session when "Confirm email" is on
    // in the Supabase dashboard (Authentication → Sign In / Providers →
    // Email). In that mode, the user gets a confirmation email; only after
    // they click can a session be issued. Detect this and surface clearly
    // instead of pushing into a redirect loop with the proxy.
    if (mode === "sign-up" && !result.data.session) {
      setState({ kind: "needs-confirmation", email });
      return;
    }

    router.push(next);
    router.refresh();
  }

  const isSubmitting = state.kind === "submitting";
  const heading = mode === "sign-in" ? "Sign in to Atlas" : "Create your account";
  const submitLabel =
    mode === "sign-in"
      ? isSubmitting
        ? "Signing in…"
        : "Sign in"
      : isSubmitting
        ? "Creating…"
        : "Create account";
  const toggleLabel =
    mode === "sign-in" ? "First time? Create an account" : "Have an account? Sign in";

  return (
    <SignInShell>
      <h1 className="mb-2 text-xl font-medium text-[#E8D6F4]">{heading}</h1>
      <p className="mb-6 text-sm text-[#A878B0]">
        {mode === "sign-in"
          ? "Email + password. Allow-listed accounts only."
          : "Use your allow-listed email and choose a password."}
      </p>

      {state.kind === "needs-confirmation" ? (
        <div className="rounded-md border border-[#FFD176]/40 bg-[#FFD176]/10 p-4 text-sm text-[#FFE7B5]">
          <p className="font-medium">Account created — confirmation required.</p>
          <p className="mt-1 text-[#FFE7B5]/80">
            Supabase is configured to require email confirmation. We sent a
            link to <strong>{state.email}</strong>. Click it, then come back
            here and sign in with the password you just set.
          </p>
          <p className="mt-3 text-xs text-[#FFE7B5]/60">
            To skip this step in future, turn off the &ldquo;Confirm email&rdquo;
            setting under Authentication → Sign In / Providers → Email in
            the Supabase dashboard.
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
              disabled={isSubmitting}
              className="w-full rounded-md border border-[#3F2570] bg-[#0A0214] px-3 py-2 text-sm text-[#E8D6F4] outline-none focus:border-[#9B6BC4] disabled:opacity-50"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-[#A878B0]">
              Password
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              disabled={isSubmitting}
              className="w-full rounded-md border border-[#3F2570] bg-[#0A0214] px-3 py-2 text-sm text-[#E8D6F4] outline-none focus:border-[#9B6BC4] disabled:opacity-50"
              placeholder={mode === "sign-up" ? "8+ characters" : ""}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-[#9B6BC4] px-3 py-2 text-sm font-medium text-[#0A0214] transition-colors hover:bg-[#C5A8DC] disabled:opacity-50"
          >
            {submitLabel}
          </button>

          {state.kind === "error" && (
            <p className="text-sm text-[#E04880]">{state.message}</p>
          )}
          {state.kind === "idle" && errorParam === "auth_failed" && (
            <p className="text-sm text-[#E04880]">
              That link expired or was already used. Sign in to continue.
            </p>
          )}
        </form>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setState({ kind: "idle" });
        }}
        className="mt-6 block w-full text-center text-xs uppercase tracking-wider text-[#A878B0] hover:text-[#D4BCE6]"
      >
        {toggleLabel}
      </button>
    </SignInShell>
  );
}
