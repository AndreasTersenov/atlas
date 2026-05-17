"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Repo {
  full_name: string;
  description: string | null;
  pushed_at: string;
  private: boolean;
}

interface Props {
  haloId: string;
}

// Phase = which top-level UI state to render. `isSaving` is tracked
// separately so the multi-select form stays rendered (with disabled inputs)
// while the POST is in flight, instead of falling through to an empty list.
type Phase =
  | { kind: "collapsed" }
  | { kind: "loading" }
  | { kind: "ready"; repos: Repo[] }
  | { kind: "error"; message: string };

const GENERIC_ERROR = "Couldn’t reach GitHub. Check the server logs.";

// Inline form rendered inside the Activity zone empty state. Click
// [Add GitHub] → fetch the user's repos → pick one or more → POST to
// /api/integrations/github/config → router.refresh() so the panel re-fetches
// with the new integration row and renders the feed.
export default function ConfigureGitHub({ haloId }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "collapsed" });
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  // Fetch the repo list lazily on first expand. No refetch on subsequent
  // expansions in the same mount — the 60s revalidate in lib/github.ts keeps
  // the server-side cache fresh enough for this UX.
  useEffect(() => {
    if (phase.kind !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/integrations/github/repos");
        if (cancelled) return;
        if (!res.ok) {
          setPhase({ kind: "error", message: GENERIC_ERROR });
          return;
        }
        const body = await res.json();
        setPhase({ kind: "ready", repos: body.repos as Repo[] });
      } catch (err) {
        if (cancelled) return;
        console.error("[configure-github] repo list fetch failed:", err);
        setPhase({ kind: "error", message: GENERIC_ERROR });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.kind]);

  const filteredRepos = useMemo(() => {
    if (phase.kind !== "ready") return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return phase.repos;
    return phase.repos.filter((r) =>
      r.full_name.toLowerCase().includes(needle)
    );
  }, [phase, filter]);

  function toggle(repo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/integrations/github/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ haloId, repos: Array.from(selected) }),
      });
      if (!res.ok) {
        setIsSaving(false);
        setPhase({ kind: "error", message: GENERIC_ERROR });
        return;
      }
      // Success — re-render the server component, which will now see the
      // halo_integrations row and render the activity feed. We leave
      // isSaving=true so the form stays disabled until React unmounts it on
      // the refresh.
      router.refresh();
    } catch (err) {
      console.error("[configure-github] save failed:", err);
      setIsSaving(false);
      setPhase({ kind: "error", message: GENERIC_ERROR });
    }
  }

  if (phase.kind === "collapsed") {
    return (
      <p className="text-sm text-[#5A4878]">
        No integrations configured.{" "}
        <button
          type="button"
          onClick={() => setPhase({ kind: "loading" })}
          className="ml-1 rounded-md border border-[#3F2570]/60 px-2 py-0.5 font-mono text-[#A878B0] transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
        >
          [Add GitHub]
        </button>
      </p>
    );
  }

  if (phase.kind === "loading") {
    return (
      <p className="text-sm text-[#5A4878]">Loading your GitHub repos…</p>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-[#E04880]">{phase.message}</p>
        <button
          type="button"
          onClick={() => setPhase({ kind: "loading" })}
          className="rounded-md border border-[#3F2570]/60 px-2 py-0.5 font-mono text-[#A878B0] transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
        >
          [Retry]
        </button>
      </div>
    );
  }

  const repos = filteredRepos;
  const allRepos = phase.repos;
  const totalLabel =
    allRepos.length === repos.length
      ? `${allRepos.length} repos`
      : `${repos.length} of ${allRepos.length} repos`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter repos…"
          disabled={isSaving}
          className="w-full max-w-sm rounded-md border border-[#3F2570]/60 bg-[#0A0214] px-2 py-1 text-sm text-[#E8D6F4] outline-none placeholder:text-[#3F2570] focus:border-[#9B6BC4] disabled:opacity-50"
        />
        <span className="shrink-0 font-mono text-xs text-[#5A4878]">
          {totalLabel}
        </span>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-[#3F2570]/40 bg-[#0A0214] p-2 text-sm">
        {repos.map((r) => {
          const checked = selected.has(r.full_name);
          return (
            <li key={r.full_name}>
              <label
                className={`flex items-start gap-2 rounded-sm px-2 py-1 ${
                  isSaving
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-[#13062A]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isSaving}
                  onChange={() => toggle(r.full_name)}
                  className="mt-1 h-3 w-3 accent-[#9B6BC4]"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[#E8D6F4]">
                    {r.full_name}
                  </span>
                  {r.private ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[#5A4878]">
                      private
                    </span>
                  ) : null}
                  {r.description ? (
                    <span className="ml-2 text-[#5A4878]">{r.description}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
        {repos.length === 0 && (
          <li className="px-2 py-2 text-[#5A4878]">No repos match.</li>
        )}
      </ul>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={selected.size === 0 || isSaving}
          className="rounded-md bg-[#9B6BC4] px-3 py-1.5 text-sm font-medium text-[#0A0214] transition-colors hover:bg-[#C5A8DC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving
            ? "Saving…"
            : `Save${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            setSelected(new Set());
            setPhase({ kind: "collapsed" });
          }}
          className="rounded-md border border-[#3F2570]/60 px-3 py-1.5 text-sm font-mono text-[#A878B0] transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
