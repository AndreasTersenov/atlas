import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import HaloNotes from "./notes";
import ConfigureGitHub from "./configure-github";
import { createServerClient } from "@/lib/supabase-server";
import { Domain, Status } from "@/lib/halo-schema";
import {
  PANEL_DOMAIN_ACCENT,
  PANEL_STATUS_ACCENT,
} from "@/components/CosmicWebMap/colors";
import { getRepoActivity, type ActivityItem } from "@/lib/github";

// Cookies are read per-request → page must be dynamic.
export const dynamic = "force-dynamic";

// Shape of halo_integrations.config when provider = "github". The route
// handler validates this on write; we re-validate on read so a hand-edited
// row surfaces as a loud failure instead of an empty feed.
const GitHubConfig = z.object({
  repos: z.array(z.string()).min(1),
});

const ACTIVITY_ACCENT: Record<
  ActivityItem["kind"],
  { label: string; tint: string }
> = {
  commit: { label: "commit", tint: "#E8A23D" },
  pull_request: { label: "PR", tint: "#9B6BC4" },
  issue: { label: "issue", tint: "#5BB8C4" },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

  // The DB has CHECK constraints restricting halos.domain and halos.status to
  // the known enums, so a value outside the set means schema drift — fail
  // loudly (ZodError → 500) instead of papering over it with a default.
  const domain = Domain.parse(halo.domain);
  const status = Status.parse(halo.status);
  const accent = PANEL_DOMAIN_ACCENT[domain];
  const statusAccent = PANEL_STATUS_ACCENT[status];
  const isLocked = status === "locked";

  // Resolve the (at most one) GitHub integration row and pull its repo list.
  // If config is shaped wrong, throw rather than silently empty the feed.
  const githubRow = integrations.find((i) => i.provider === "github");
  const githubRepos = githubRow
    ? GitHubConfig.parse(githubRow.config).repos
    : [];

  // Fetch activity in the same request. Failure here shouldn't take down the
  // whole panel (PAT could be invalid, a repo could be deleted) — capture
  // the error and render an inline notice in the feed instead.
  let activity: ActivityItem[] = [];
  let activityError: string | null = null;
  if (githubRepos.length > 0) {
    try {
      activity = await getRepoActivity(githubRepos);
    } catch (err) {
      activityError = err instanceof Error ? err.message : "unknown error";
    }
  }

  const lastActivityTs = activity[0]?.timestamp;

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
              {domain}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={{ background: statusAccent.bg, color: statusAccent.text }}
            >
              {status}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-[#A878B0]">
            {isLocked
              ? "Private cluster — content TBD."
              : halo.description_long || halo.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#5A4878]">
              last activity:{" "}
              {lastActivityTs ? formatTimestamp(lastActivityTs) : "—"}
            </span>
            {githubRepos.length > 0 ? (
              <a
                href={`https://github.com/${githubRepos[0]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#A878B0] transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
                title={
                  githubRepos.length > 1
                    ? `+${githubRepos.length - 1} more configured`
                    : undefined
                }
              >
                open in GitHub →
              </a>
            ) : (
              <span
                className="rounded-md border border-[#3F2570]/60 px-2 py-1 font-mono text-[#5A4878]"
                title="Configure a GitHub integration to enable"
              >
                open in GitHub →
              </span>
            )}
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
              <h2 className="mb-3 flex items-baseline justify-between text-xs font-medium uppercase tracking-[0.2em] text-[#A878B0]">
                Activity
                {githubRepos.length > 0 && (
                  <span className="font-mono normal-case tracking-normal text-[10px] text-[#5A4878]">
                    {githubRepos.join(" · ")}
                  </span>
                )}
              </h2>
              {githubRepos.length === 0 ? (
                <ConfigureGitHub haloId={halo.id} />
              ) : activityError ? (
                <p className="text-sm text-[#E04880]">
                  Couldn’t reach GitHub: {activityError}
                </p>
              ) : activity.length === 0 ? (
                <p className="text-sm text-[#5A4878]">
                  No recent activity in the configured repos.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {activity.map((item) => {
                    const tone = ACTIVITY_ACCENT[item.kind];
                    return (
                      <li
                        key={`${item.repo}:${item.ref}`}
                        className="flex items-baseline gap-3"
                      >
                        <span
                          className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
                          style={{ color: tone.tint }}
                        >
                          {tone.label}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-[#5A4878]">
                          {item.repo} {item.ref}
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate text-[#E8D6F4] hover:text-[#C5A8DC]"
                          title={item.title}
                        >
                          {item.title}
                        </a>
                        <span className="shrink-0 font-mono text-xs text-[#5A4878]">
                          {formatTimestamp(item.timestamp)}
                        </span>
                      </li>
                    );
                  })}
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
