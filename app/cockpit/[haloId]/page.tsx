import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import HaloNotes from "./notes";
import { createServerClient } from "@/lib/supabase-server";
import type { Domain, Status } from "@/lib/halo-schema";

// Cookies are read per-request → page must be dynamic.
export const dynamic = "force-dynamic";

// Muted accent backgrounds + ring colors per domain, cribbed from
// components/CosmicWebMap/colors.ts. Re-inlined here so the panel doesn't
// pull a client-shaped module into a server component.
const DOMAIN_ACCENT: Record<Domain, { bg: string; text: string; ring: string }> = {
  research: { bg: "#3A1820", text: "#FFE7B5", ring: "#E8A23D" },
  career: { bg: "#1A3540", text: "#A8DAE0", ring: "#5BB8C4" },
  infrastructure: { bg: "#2A1842", text: "#E8D6F4", ring: "#9B6BC4" },
  teaching: { bg: "#1E3520", text: "#D5EED5", ring: "#6FA86F" },
  bronze: { bg: "#3A2818", text: "#F0DAA8", ring: "#C49B5B" },
  personal: { bg: "#1F1F25", text: "#9C9CA8", ring: "#7A7A82" },
};

const STATUS_ACCENT: Record<Status, { bg: string; text: string }> = {
  active: { bg: "#1E3520", text: "#A8D8A8" },
  dormant: { bg: "#2A1842", text: "#C5A8DC" },
  locked: { bg: "#1F1F25", text: "#9C9CA8" },
  completed: { bg: "#1A3540", text: "#A8DAE0" },
};

export default async function HaloPanel({
  params,
}: {
  params: Promise<{ haloId: string }>;
}) {
  const { haloId } = await params;
  const supabase = await createServerClient();

  // Belt-and-braces, same pattern as /cockpit: proxy already redirected, but
  // a misconfigured proxy can't accidentally leak per-user rows from this
  // page if we re-check here.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/cockpit/${haloId}`)}`);
  }

  // Halos table is public-read (no RLS — same rows for everyone, per A10).
  // halo_integrations and halo_agents are RLS-scoped to auth.uid() = owner_id
  // so the server client only sees the current user's rows.
  const [haloResult, integrationsResult, agentsResult] = await Promise.all([
    supabase.from("halos").select("*").eq("id", haloId).maybeSingle(),
    supabase.from("halo_integrations").select("*").eq("halo_id", haloId),
    supabase.from("halo_agents").select("*").eq("halo_id", haloId),
  ]);

  if (haloResult.error) {
    throw new Error(`Failed to load halo: ${haloResult.error.message}`);
  }
  if (!haloResult.data) notFound();
  if (integrationsResult.error) {
    throw new Error(
      `Failed to load integrations: ${integrationsResult.error.message}`
    );
  }
  if (agentsResult.error) {
    throw new Error(`Failed to load agents: ${agentsResult.error.message}`);
  }

  const halo = haloResult.data;
  const integrations = integrationsResult.data ?? [];
  const agents = agentsResult.data ?? [];

  // halos.domain / halos.status come back as `string` (the schema admits any
  // value at the DB level); narrow with a lookup-or-default rather than
  // blow up on unknown values.
  const accent =
    DOMAIN_ACCENT[halo.domain as Domain] ?? DOMAIN_ACCENT.research;
  const statusAccent =
    STATUS_ACCENT[halo.status as Status] ?? STATUS_ACCENT.active;
  const isLocked = halo.status === "locked";

  return (
    <main className="min-h-dvh bg-[#0A0214] text-[#E8D6F4]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Top chrome: back to cockpit, signed-in email, sign-out */}
        <div className="mb-6 flex items-center justify-between text-xs">
          <Link
            href="/cockpit"
            className="rounded-md border border-[#3F2570]/50 bg-[#13062A]/70 px-3 py-1.5 font-mono text-[#A878B0] backdrop-blur transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
          >
            ← cockpit
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[#5A4878]">{user.email}</span>
            <form action="/auth/sign-out" method="POST">
              <button
                type="submit"
                className="rounded-md border border-[#3F2570]/50 bg-[#13062A]/70 px-3 py-1.5 font-mono text-[#A878B0] backdrop-blur transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
              >
                sign out
              </button>
            </form>
          </div>
        </div>

        {/* Zone 1: Header */}
        <header className="mb-6 rounded-lg border border-[#3F2570]/60 bg-[#13062A] p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h1
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
              style={{ color: accent.ring }}
            >
              {halo.name}
            </h1>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={{ background: accent.bg, color: accent.text }}
            >
              {halo.domain}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={{ background: statusAccent.bg, color: statusAccent.text }}
            >
              {halo.status}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-[#A878B0]">
            {isLocked
              ? "Private cluster — content TBD."
              : halo.description_long || halo.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#5A4878]">
              last activity: —
            </span>
            <span
              className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#5A4878]"
              title="Wired in v1.4 (GitHub integration)"
            >
              open in GitHub →
            </span>
            <span
              className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#5A4878]"
              title="Wired in v2 (Todoist integration)"
            >
              open in Todoist →
            </span>
            <span
              className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#5A4878]"
              title="Wired in v2 (Gmail integration)"
            >
              open in Gmail →
            </span>
          </div>
        </header>

        {/* Body: feed + agents stacked on the left, notes on the right */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Zone 2: Activity feed */}
            <section className="rounded-lg border border-[#3F2570]/60 bg-[#13062A] p-5">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#A878B0]">
                Activity
              </h2>
              {integrations.length === 0 ? (
                <p className="text-sm text-[#5A4878]">
                  No integrations configured.{" "}
                  <button
                    type="button"
                    disabled
                    title="Coming in v1.4"
                    className="ml-1 cursor-not-allowed rounded-md border border-[#3F2570]/60 px-2 py-0.5 font-mono text-[#A878B0] opacity-60"
                  >
                    [Add one]
                  </button>
                </p>
              ) : (
                <ul className="space-y-2 text-sm text-[#A878B0]">
                  {integrations.map((i) => (
                    <li key={i.id} className="font-mono">
                      {i.provider} configured · feed wiring coming in v1.4
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Zone 3: Agent strip */}
            <section className="rounded-lg border border-[#3F2570]/60 bg-[#13062A] p-5">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[#A878B0]">
                Agents
              </h2>
              {agents.length === 0 ? (
                <p className="text-sm text-[#5A4878]">
                  No agents available.{" "}
                  <button
                    type="button"
                    disabled
                    title="Coming in v1.5"
                    className="ml-1 cursor-not-allowed rounded-md border border-[#3F2570]/60 px-2 py-0.5 font-mono text-[#A878B0] opacity-60"
                  >
                    [Browse]
                  </button>
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {agents.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-baseline justify-between"
                    >
                      <span>
                        <span className="font-medium text-[#E8D6F4]">
                          {a.name}
                        </span>
                        {a.description ? (
                          <span className="ml-2 text-[#A878B0]">
                            {a.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="ml-3 shrink-0 font-mono text-xs text-[#5A4878]">
                        {a.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Zone 4: Notes — client-only, persists to localStorage per A13 */}
          <HaloNotes haloId={halo.id} />
        </div>
      </div>
    </main>
  );
}
