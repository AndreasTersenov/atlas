// Helpers for reading Claude Code's per-session JSONL transcript files at
// ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl.
//
// Each line is one JSON event. Claude Code emits ~9 distinct top-level
// types — `user`, `assistant`, `attachment`, `system`, `last-prompt`,
// `permission-mode`, `ai-title`, `file-history-snapshot`, `pr-link`. The
// schema below is intentionally loose (`.passthrough()` keeps unknown
// fields, all envelope fields are optional) so a new event type Anthropic
// adds doesn't break the bridge.
//
// The bridge stores the parsed line verbatim in session_messages.content
// and bucket-normalizes the event type into a small `role` set the cockpit
// can switch on for rendering.

import { z } from "zod";

export const TranscriptLine = z
  .object({
    type: z.string(),
    sessionId: z.string().optional(),
    uuid: z.string().optional(),
    parentUuid: z.string().nullish(),
    timestamp: z.string().optional(),
    cwd: z.string().optional(),
    gitBranch: z.string().optional(),
    version: z.string().optional(),
    // `message` carries the Anthropic-SDK message shape for user/assistant
    // events; other types use top-level fields. Type is unknown to keep
    // forward compat with content-block changes.
    message: z.unknown().optional(),
    attachment: z.unknown().optional(),
    isMeta: z.boolean().optional(),
    isSidechain: z.boolean().optional(),
  })
  .passthrough();

export type TranscriptLine = z.infer<typeof TranscriptLine>;

// The cockpit's render-side concerns are coarser than Claude Code's event
// taxonomy. A few buckets cover everything we need.
export type NormalizedRole =
  | "user"
  | "assistant"
  | "attachment"
  | "system"
  | "meta";

const ROLE_FROM_TYPE: Record<string, NormalizedRole> = {
  user: "user",
  assistant: "assistant",
  attachment: "attachment",
  system: "system",
  "last-prompt": "meta",
  "permission-mode": "meta",
  "ai-title": "meta",
  "file-history-snapshot": "meta",
  "pr-link": "meta",
};

export function parseLine(rawLine: string): TranscriptLine | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = TranscriptLine.safeParse(parsed);
  return result.success ? result.data : null;
}

export function normalizeRole(line: TranscriptLine): NormalizedRole {
  // `user` events with isMeta=true are not actual user prompts — they're
  // command outputs, system reminders, hook results piped back to the
  // session. Bucket them as meta so the cockpit can hide them from the
  // main transcript view by default.
  if (line.type === "user" && line.isMeta) return "meta";
  return ROLE_FROM_TYPE[line.type] ?? "meta";
}
