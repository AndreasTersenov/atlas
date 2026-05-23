// Atlas v1.5 — cross-machine Claude observatory bridge.
//
// Runs as `npm run bridge` in a tmux window on each machine (macbook,
// titan in v1.5). Watches ~/.claude/projects/ for Claude Code session
// transcripts and pushes their messages into Supabase so the cockpit can
// render live what's happening on every machine.
//
// Architecture (see docs/V1_5_PLAN.md §B for the prose version):
//
//   1. Load ~/.atlas/mapping.json — cwd glob → halo_id rules.
//   2. Resolve owner_id from owner_email via the service-role admin API.
//   3. Watch ~/.claude/projects/ recursively. For each *.jsonl file:
//      - On add:    detect the session's cwd (from the first line that
//                   has one; falls back to the encoded dir name), upsert
//                   a claude_sessions row.
//      - On change: re-read the whole file (transcripts are bounded —
//                   a few MB at most), slice off complete lines via the
//                   "ends in \n" trick to avoid consuming a mid-write
//                   partial line, parse + upsert any line we haven't
//                   processed yet. Idempotent on (session, sequence).
//   4. Every 30s, heartbeat last_seen for sessions that have seen
//      activity in the last heartbeat window.
//   5. Every 60s, sweep for sessions with last_seen older than 5 min and
//      flip them to status=idle.
//   6. On clean exit (SIGINT/SIGTERM), best-effort mark currently-active
//      sessions as idle so the cockpit doesn't show them as fake-live.
//
// State is in-memory only. If the bridge restarts, it re-reads each
// transcript from byte 0 — every (session_id, sequence) upsert is a
// no-op so this is safe.
//
// Auth: uses SUPABASE_SERVICE_ROLE_KEY from .env.local. Writes rows with
// owner_id set explicitly. Single-user system; revisit when adding
// collaborators.

import "dotenv/config";
import chokidar from "chokidar";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, resolve, dirname } from "node:path";

import { createAdminClient } from "../lib/supabase-admin";
import {
  loadMapping,
  resolveHalo,
  DEFAULT_MAPPING_PATH,
  type Mapping,
} from "../lib/atlas-mapping";
import {
  parseLine,
  normalizeRole,
  type TranscriptLine,
} from "../lib/atlas-transcript";
import type { Database, Json } from "../lib/database.types";

// ─── config ───────────────────────────────────────────────────────────────

const PROJECTS_DIR = resolve(process.env.HOME ?? "~", ".claude", "projects");
const MAPPING_PATH = process.env.ATLAS_MAPPING_PATH ?? DEFAULT_MAPPING_PATH;
const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_SWEEP_INTERVAL_MS = 60_000;
const IDLE_AFTER_MS = 5 * 60_000;

// ─── types ────────────────────────────────────────────────────────────────

interface SessionState {
  filePath: string;
  rowId: string; // claude_sessions.id (UUID)
  claudeSessionId: string; // the UUID Claude Code uses in the filename
  cwd: string;
  haloId: string | null;
  lastSequence: number; // count of file lines we've processed
  lastTouched: number; // Date.now() of the last heartbeat
}

type SessionMessageInsert =
  Database["public"]["Tables"]["session_messages"]["Insert"];

// ─── globals ──────────────────────────────────────────────────────────────

const HOSTNAME = hostname();
const sessions = new Map<string, SessionState>(); // keyed by absolute filePath

// ─── helpers ──────────────────────────────────────────────────────────────

function log(...args: unknown[]) {
  // Plain stderr — tmux scrollback is the log surface for v1.5.
  console.error("[atlas-bridge]", ...args);
}

function decodeProjectDirName(dirName: string): string {
  // Claude Code encodes the project's cwd by replacing `/` with `-`. The
  // encoding is lossy if any directory name itself contained `-`, so we
  // only fall back to this when the JSONL doesn't carry an authoritative
  // cwd field.
  return "/" + dirName.replace(/^-/, "").replace(/-/g, "/");
}

async function detectCwd(filePath: string): Promise<string> {
  try {
    const text = await readFile(filePath, "utf-8");
    const lines = text.split("\n");
    // First ~50 lines is plenty — `cwd` shows up on every user/assistant
    // event, which appears within the first few entries.
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const parsed = parseLine(lines[i]);
      if (parsed?.cwd) return parsed.cwd;
    }
  } catch (err) {
    log(`detectCwd: read failed for ${filePath}:`, err);
  }
  return decodeProjectDirName(basename(dirname(filePath)));
}

async function resolveOwnerId(
  client: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string> {
  // listUsers paginates at 50 by default; for a single-user atlas that's
  // fine. If we ever cross 50, switch to paginated walk.
  const { data, error } = await client.auth.admin.listUsers();
  if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(
      `No auth.users row found for owner_email ${email}. ` +
        `Sign up via the cockpit first.`
    );
  }
  return user.id;
}

// ─── per-file handling ────────────────────────────────────────────────────

async function upsertSessionRow(
  client: ReturnType<typeof createAdminClient>,
  ownerId: string,
  mapping: Mapping,
  filePath: string
): Promise<SessionState | null> {
  const claudeSessionId = basename(filePath, ".jsonl");
  const cwd = await detectCwd(filePath);
  const haloId = resolveHalo(cwd, mapping);

  // Insert if new; fetch existing if already there. We split rather than
  // .upsert() so a re-add of an existing session doesn't overwrite
  // started_at with the current timestamp.
  const { data: existing, error: selectError } = await client
    .from("claude_sessions")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("hostname", HOSTNAME)
    .eq("claude_session_id", claudeSessionId)
    .maybeSingle();
  if (selectError) {
    log(`select claude_sessions failed for ${filePath}:`, selectError);
    return null;
  }

  let rowId: string;
  if (existing) {
    // Re-seeing a known session (bridge restart). Flip back to active +
    // heartbeat; preserve started_at, cwd, halo_id.
    rowId = existing.id;
    const { error: updateError } = await client
      .from("claude_sessions")
      .update({ status: "active", last_seen: new Date().toISOString() })
      .eq("id", rowId);
    if (updateError) {
      log(`update on resume failed for ${filePath}:`, updateError);
      return null;
    }
  } else {
    const { data: inserted, error: insertError } = await client
      .from("claude_sessions")
      .insert({
        owner_id: ownerId,
        hostname: HOSTNAME,
        claude_session_id: claudeSessionId,
        cwd,
        halo_id: haloId,
        status: "active",
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      log(`insert claude_sessions failed for ${filePath}:`, insertError);
      return null;
    }
    rowId = inserted.id;
    log(`new session: ${claudeSessionId} → halo=${haloId ?? "(unmapped)"} cwd=${cwd}`);
  }

  return {
    filePath,
    rowId,
    claudeSessionId,
    cwd,
    haloId,
    lastSequence: 0,
    lastTouched: Date.now(),
  };
}

async function processNewLines(
  client: ReturnType<typeof createAdminClient>,
  ownerId: string,
  state: SessionState
) {
  let text: string;
  try {
    text = await readFile(state.filePath, "utf-8");
  } catch (err) {
    log(`read failed for ${state.filePath}:`, err);
    return;
  }

  // Split, then drop the trailing element. If the file ends in \n the
  // trailing element is '' (split artifact). If not, it's a partial line
  // mid-write and we must not consume it; the next change event will
  // re-read with the line complete.
  const split = text.split("\n");
  const completeLines = split.slice(0, -1);

  if (state.lastSequence >= completeLines.length) return;

  const rowsToInsert: SessionMessageInsert[] = [];
  for (let seq = state.lastSequence; seq < completeLines.length; seq++) {
    const lineText = completeLines[seq];
    if (!lineText.trim()) continue;
    const parsed: TranscriptLine | null = parseLine(lineText);
    if (!parsed) {
      log(`skip malformed line at ${state.claudeSessionId}:${seq}`);
      continue;
    }
    rowsToInsert.push({
      owner_id: ownerId,
      session_id: state.rowId,
      sequence: seq,
      role: normalizeRole(parsed),
      content: parsed as unknown as Json,
    });
  }

  if (rowsToInsert.length > 0) {
    const { error } = await client
      .from("session_messages")
      .upsert(rowsToInsert, { onConflict: "session_id,sequence" });
    if (error) {
      log(`upsert session_messages failed for ${state.filePath}:`, error);
      // Don't advance — let the next change event retry.
      return;
    }
  }

  state.lastSequence = completeLines.length;
  state.lastTouched = Date.now();

  // Heartbeat last_seen on every batch with new content. The 30s timer
  // below handles sessions that have written nothing but are still "open".
  await client
    .from("claude_sessions")
    .update({ last_seen: new Date().toISOString(), status: "active" })
    .eq("id", state.rowId);
}

async function markEnded(
  client: ReturnType<typeof createAdminClient>,
  state: SessionState
) {
  await client
    .from("claude_sessions")
    .update({ status: "ended", last_seen: new Date().toISOString() })
    .eq("id", state.rowId);
  log(`session ended: ${state.claudeSessionId}`);
}

// ─── periodic sweeps ──────────────────────────────────────────────────────

async function heartbeatActiveSessions(
  client: ReturnType<typeof createAdminClient>
) {
  const now = Date.now();
  const ids = Array.from(sessions.values())
    .filter((s) => now - s.lastTouched < IDLE_AFTER_MS)
    .map((s) => s.rowId);
  if (ids.length === 0) return;
  await client
    .from("claude_sessions")
    .update({ last_seen: new Date().toISOString() })
    .in("id", ids);
}

async function sweepIdleSessions(
  client: ReturnType<typeof createAdminClient>,
  ownerId: string
) {
  const cutoff = new Date(Date.now() - IDLE_AFTER_MS).toISOString();
  await client
    .from("claude_sessions")
    .update({ status: "idle" })
    .eq("owner_id", ownerId)
    .eq("hostname", HOSTNAME)
    .eq("status", "active")
    .lt("last_seen", cutoff);
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
  }

  const mapping = loadMapping(MAPPING_PATH);
  log(`loaded mapping (${mapping.halos.length} rules) from ${MAPPING_PATH}`);

  const client = createAdminClient(url, serviceKey);
  const ownerId = await resolveOwnerId(client, mapping.owner_email);
  log(`owner resolved: ${mapping.owner_email} → ${ownerId}`);
  log(`hostname: ${HOSTNAME}`);
  log(`watching: ${PROJECTS_DIR}`);

  const watcher = chokidar.watch(PROJECTS_DIR, {
    persistent: true,
    ignoreInitial: false, // pick up files that already exist at startup
    depth: 2, // ~/.claude/projects/<encoded-cwd>/<session>.jsonl
    awaitWriteFinish: false,
  });

  watcher.on("add", async (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;
    if (sessions.has(filePath)) return;
    const state = await upsertSessionRow(client, ownerId, mapping, filePath);
    if (!state) return;
    sessions.set(filePath, state);
    // Process whatever's already in the file at startup / first sighting.
    await processNewLines(client, ownerId, state);
  });

  watcher.on("change", async (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;
    const state = sessions.get(filePath);
    if (!state) return;
    await processNewLines(client, ownerId, state);
  });

  watcher.on("unlink", async (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;
    const state = sessions.get(filePath);
    if (!state) return;
    sessions.delete(filePath);
    await markEnded(client, state);
  });

  watcher.on("error", (err: unknown) => log("watcher error:", err));

  const heartbeatTimer = setInterval(
    () => heartbeatActiveSessions(client).catch((e) => log("heartbeat:", e)),
    HEARTBEAT_INTERVAL_MS
  );
  const idleTimer = setInterval(
    () => sweepIdleSessions(client, ownerId).catch((e) => log("idle sweep:", e)),
    IDLE_SWEEP_INTERVAL_MS
  );

  // Graceful shutdown — mark whatever's still tracked as idle so the
  // cockpit doesn't show stale "active" rows when the bridge is down.
  const shutdown = async (signal: string) => {
    log(`received ${signal}, marking active sessions as idle`);
    clearInterval(heartbeatTimer);
    clearInterval(idleTimer);
    await watcher.close();
    const activeRowIds = Array.from(sessions.values()).map((s) => s.rowId);
    if (activeRowIds.length > 0) {
      await client
        .from("claude_sessions")
        .update({ status: "idle" })
        .in("id", activeRowIds);
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log("bridge running. Ctrl-C to stop.");
}

main().catch((err) => {
  console.error("[atlas-bridge] fatal:", err);
  process.exit(1);
});
