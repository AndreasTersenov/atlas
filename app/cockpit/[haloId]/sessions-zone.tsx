"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { Database } from "@/lib/database.types";

type Session = Database["public"]["Tables"]["claude_sessions"]["Row"];
type Message = Database["public"]["Tables"]["session_messages"]["Row"];

interface Props {
  haloId: string;
  initialSessions: Session[];
  initialMessages: Record<string, Message[]>;
}

const STATUS_TONE: Record<Session["status"], { label: string; tint: string }> = {
  active: { label: "active", tint: "#A8D8A8" },
  idle: { label: "idle", tint: "#C5A8DC" },
  ended: { label: "ended", tint: "#5A4878" },
};

const ROLE_TONE: Record<string, { label: string; tint: string }> = {
  user: { label: "you", tint: "#FFE7B5" },
  assistant: { label: "claude", tint: "#C5A8DC" },
  attachment: { label: "attach", tint: "#5BB8C4" },
  system: { label: "system", tint: "#5A4878" },
  meta: { label: "meta", tint: "#5A4878" },
};

// Each session_messages.content is the parsed JSONL line. For rendering, we
// pull a single "preview text" out of it via best-effort traversal. Claude
// Code's exact shapes evolve, so we try common patterns and fall back to a
// truncated JSON dump rather than throw.
function extractText(content: unknown): string {
  if (typeof content !== "object" || content === null) {
    return typeof content === "string" ? content : "";
  }
  const c = content as Record<string, unknown>;

  // Assistant: content.message.content = [{ type: "text", text }, { type: "thinking", ... }, ...]
  if (
    c.type === "assistant" &&
    typeof c.message === "object" &&
    c.message !== null
  ) {
    const msg = c.message as Record<string, unknown>;
    const blocks = Array.isArray(msg.content) ? (msg.content as Array<Record<string, unknown>>) : [];
    const text = blocks
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
    if (text) return text;
    // No text blocks (pure tool_use response). Tag it.
    const toolUses = blocks.filter((b) => b?.type === "tool_use");
    if (toolUses.length > 0) {
      const names = toolUses
        .map((b) => (typeof b.name === "string" ? b.name : "?"))
        .join(", ");
      return `(tool calls: ${names})`;
    }
    const thinks = blocks.filter((b) => b?.type === "thinking");
    if (thinks.length > 0) return "(thinking…)";
  }

  // User: content.message is often a structured object too. Sometimes a string.
  if (c.type === "user") {
    if (typeof c.message === "string") return c.message;
    if (typeof c.message === "object" && c.message !== null) {
      const msg = c.message as Record<string, unknown>;
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter(
            (b: unknown) =>
              typeof b === "object" &&
              b !== null &&
              (b as Record<string, unknown>).type === "text" &&
              typeof (b as Record<string, unknown>).text === "string"
          )
          .map((b) => (b as Record<string, unknown>).text as string)
          .join("\n");
        if (text) return text;
      }
    }
  }

  // Attachment: try the hookName / toolUseID surface
  if (c.type === "attachment" && typeof c.attachment === "object" && c.attachment !== null) {
    const a = c.attachment as Record<string, unknown>;
    const hook = typeof a.hookName === "string" ? a.hookName : "";
    const tool = typeof a.toolUseID === "string" ? a.toolUseID.slice(0, 8) : "";
    return `attachment${hook ? `: ${hook}` : ""}${tool ? ` · ${tool}` : ""}`;
  }

  return "";
}

function shortCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join("/")}`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function SessionsZone({
  haloId,
  initialSessions,
  initialMessages,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [messages, setMessages] = useState<Record<string, Message[]>>(
    initialMessages
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Tick so the "Xm ago" strings refresh without a full re-render.
  const [, setTick] = useState(0);
  const channelOpen = useRef(false);

  // Realtime: subscribe to sessions for this halo + all session_messages
  // (RLS filters to current user; we bucket client-side by session_id).
  useEffect(() => {
    if (channelOpen.current) return;
    channelOpen.current = true;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`halo-${haloId}-sessions`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "claude_sessions",
          filter: `halo_id=eq.${haloId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Session;
            setSessions((cur) =>
              cur.some((s) => s.id === row.id) ? cur : [row, ...cur]
            );
            // Seed an empty buffer so the message INSERT handler (which
            // filters out unknown session_ids) accepts events for this
            // session as soon as the bridge starts streaming them.
            setMessages((cur) =>
              row.id in cur ? cur : { ...cur, [row.id]: [] }
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Session;
            setSessions((cur) =>
              cur.map((s) => (s.id === row.id ? row : s))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setSessions((cur) => cur.filter((s) => s.id !== id));
            setMessages((cur) => {
              if (!(id in cur)) return cur;
              const next = { ...cur };
              delete next[id];
              return next;
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_messages",
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((cur) => {
            // Drop inserts for sessions this panel doesn't render. RLS
            // already scopes Realtime events to the current user, but a
            // user with many active sessions across halos would otherwise
            // grow this buffer unboundedly with irrelevant rows.
            if (!(msg.session_id in cur)) return cur;
            const existing = cur[msg.session_id];
            // Cap per-session message buffer at 50 — same as the server
            // initial fetch — so the panel doesn't grow unbounded for a
            // long-running session.
            const next = [...existing, msg]
              .sort((a, b) => a.sequence - b.sequence)
              .slice(-50);
            return { ...cur, [msg.session_id]: next };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelOpen.current = false;
    };
  }, [haloId]);

  // Refresh the relative-time labels every 30s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
      ),
    [sessions]
  );

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[#5A4878]">
        No Claude sessions seen yet. Start `claude` in a mapped directory on
        any machine running the bridge and a row will appear here within a
        few seconds.
      </p>
    );
  }

  return (
    <ul className="space-y-2 text-sm">
      {sorted.map((session) => {
        const isOpen = expanded.has(session.id);
        const tone =
          STATUS_TONE[session.status] ?? STATUS_TONE.idle;
        const sessionMessages = messages[session.id] ?? [];
        return (
          <li
            key={session.id}
            className="rounded-md border border-[#3F2570]/40 bg-[#0A0214]/60"
          >
            <button
              type="button"
              onClick={() => toggle(session.id)}
              className="flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors hover:bg-[#13062A]"
            >
              <span
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
                style={{ color: tone.tint }}
              >
                {tone.label}
              </span>
              <span className="shrink-0 font-mono text-xs text-[#A878B0]">
                {session.hostname}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#5A4878]">
                {shortCwd(session.cwd)}
              </span>
              <span className="shrink-0 font-mono text-xs text-[#5A4878]">
                {formatRelative(session.last_seen)}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-[#5A4878]">
                {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-[#3F2570]/40 px-3 py-2">
                {sessionMessages.length === 0 ? (
                  <p className="text-xs text-[#5A4878]">
                    No messages buffered yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {sessionMessages.map((m) => {
                      const tone =
                        ROLE_TONE[m.role] ?? ROLE_TONE.meta;
                      const text = extractText(m.content) || "(no preview)";
                      return (
                        <li key={m.id} className="flex items-baseline gap-2">
                          <span
                            className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
                            style={{ color: tone.tint }}
                          >
                            {tone.label}
                          </span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-[#E8D6F4]">
                            {text.length > 600
                              ? text.slice(0, 600) + "…"
                              : text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
