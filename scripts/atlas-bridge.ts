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
//                   a claude_sessions row. Sessions whose transcript
//                   hasn't grown in >5min register as idle with
//                   last_seen = file mtime, so a bridge restart doesn't
//                   make weeks-old transcripts look live.
//      - On change: read only the bytes appended since the last read
//                   (tracked per-file offset; partial trailing lines are
//                   carried as bytes until their newline arrives — \n is
//                   a single byte in UTF-8, so splitting at the buffer
//                   level can't corrupt multibyte chars). Parse + upsert
//                   any complete line. Idempotent on (session, sequence).
//                   Transcripts grow to many MB and Claude Code flushes
//                   several times a second — re-reading from byte 0 per
//                   event would be O(file²), which matters double on the
//                   HPCs where $HOME is a network filesystem.
//      - Unmapped sessions (cwd matches no mapping rule) get a
//        claude_sessions row — so the cockpit can say "unmapped session
//        on titan, update your mapping" — but their transcript content
//        is NOT ingested. Mapped halos are what the observatory renders;
//        unmapped content would only burn Supabase storage (500MB free
//        tier) and widen the privacy surface for zero render value.
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

// Load .env.local (Next.js convention) rather than the default .env so the
// bridge picks up the same SUPABASE_SERVICE_ROLE_KEY the rest of the
// repo uses. Falls back to plain .env if .env.local is absent (e.g. on a
// freshly-cloned HPC checkout where the user only copied `.env`).
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // back-fill from .env without overriding existing keys

import chokidar from "chokidar";
import { open, stat } from "node:fs/promises";
import { homedir, hostname, platform } from "node:os";
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
  sanitizeForJsonb,
  type TranscriptLine,
} from "../lib/atlas-transcript";
import type { Database, Json } from "../lib/database.types";

// ─── config ───────────────────────────────────────────────────────────────

// homedir() reads $HOME on Unix / equivalents on Windows; falls back to the
// passwd-database / user-profile entry if HOME is unset. Don't use the
// literal "~" — Node's `resolve()` doesn't expand it.
const PROJECTS_DIR = resolve(homedir(), ".claude", "projects");
const MAPPING_PATH = process.env.ATLAS_MAPPING_PATH ?? DEFAULT_MAPPING_PATH;
const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_SWEEP_INTERVAL_MS = 60_000;
const IDLE_AFTER_MS = 5 * 60_000;

// inotify doesn't see writes made by a *different* NFS/Lustre client (e.g.
// a rorqual compute-node session vs a login-node bridge), and Lustre's
// inotify support is unreliable even single-node — so on Linux we default
// to stat-polling. macOS (local APFS + fsevents) keeps native watching.
// Override either way with ATLAS_POLL=1 / ATLAS_POLL=0.
const USE_POLLING =
  process.env.ATLAS_POLL !== undefined
    ? process.env.ATLAS_POLL === "1"
    : platform() === "linux";
const POLL_INTERVAL_MS = 3_000;

// ─── types ────────────────────────────────────────────────────────────────

interface SessionState {
  filePath: string;
  rowId: string; // claude_sessions.id (UUID)
  claudeSessionId: string; // the UUID Claude Code uses in the filename
  cwd: string;
  haloId: string | null;
  lastSequence: number; // count of file lines we've processed
  lastTouched: number; // mtime (ms) of the file at the last successful batch
  byteOffset: number; // how far into the file we've consumed
  partial: Buffer; // trailing bytes of an incomplete line, waiting for \n
  inFlight: boolean; // a drain is currently running for this file
  rerun: boolean; // a change event arrived mid-drain; drain again after
}

type SessionMessageInsert =
  Database["public"]["Tables"]["session_messages"]["Insert"];

// ─── globals ──────────────────────────────────────────────────────────────

// Stable machine label for claude_sessions.hostname. Set from
// mapping.machine in main(); the os.hostname() fallback is unstable on a
// laptop (it follows DHCP/DNS), which would re-register every transcript as
// a new session whenever the network changes.
let MACHINE = hostname();
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
  // `cwd` shows up on every user/assistant event, which appears within the
  // first few entries — the first 64KB is plenty. Bounded read so a multi-MB
  // transcript doesn't get pulled into memory just to find one field.
  try {
    const handle = await open(filePath, "r");
    try {
      const buf = Buffer.alloc(65_536);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      const lines = buf.subarray(0, bytesRead).toString("utf-8").split("\n");
      for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed?.cwd) return parsed.cwd;
      }
    } finally {
      await handle.close();
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

  // Status from the file's own clock, not the bridge's: a bridge (re)start
  // sweeps up every transcript on disk, and weeks-old sessions must not
  // light up as "active" in the cockpit for the next 5 minutes.
  let mtimeMs = Date.now();
  let birthtimeMs = mtimeMs;
  try {
    const st = await stat(filePath);
    mtimeMs = st.mtimeMs;
    birthtimeMs = st.birthtimeMs || st.mtimeMs;
  } catch (err) {
    log(`stat failed for ${filePath}:`, err);
  }
  const isFresh = Date.now() - mtimeMs < IDLE_AFTER_MS;
  const observedStatus = isFresh ? "active" : "idle";
  const observedLastSeen = new Date(mtimeMs).toISOString();

  // Insert if new; fetch existing if already there. We split rather than
  // .upsert() so a re-add of an existing session doesn't overwrite
  // started_at with the current timestamp.
  const { data: existing, error: selectError } = await client
    .from("claude_sessions")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("hostname", MACHINE)
    .eq("claude_session_id", claudeSessionId)
    .maybeSingle();
  if (selectError) {
    log(`select claude_sessions failed for ${filePath}:`, selectError);
    return null;
  }

  let rowId: string;
  if (existing) {
    // Re-seeing a known session (bridge restart). Refresh status/last_seen
    // from the file mtime; preserve started_at, cwd, halo_id. (Don't touch
    // status for stale files — a session the previous run marked `ended`
    // shouldn't resurrect as `idle` just because the file is still on disk.)
    rowId = existing.id;
    if (isFresh) {
      const { error: updateError } = await client
        .from("claude_sessions")
        .update({ status: "active", last_seen: observedLastSeen })
        .eq("id", rowId);
      if (updateError) {
        log(`update on resume failed for ${filePath}:`, updateError);
        return null;
      }
    }
  } else {
    const { data: inserted, error: insertError } = await client
      .from("claude_sessions")
      .insert({
        owner_id: ownerId,
        hostname: MACHINE,
        claude_session_id: claudeSessionId,
        cwd,
        halo_id: haloId,
        status: observedStatus,
        started_at: new Date(birthtimeMs).toISOString(),
        last_seen: observedLastSeen,
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
    lastTouched: mtimeMs,
    byteOffset: 0,
    partial: Buffer.alloc(0),
    inFlight: false,
    rerun: false,
  };
}

async function processNewLines(
  client: ReturnType<typeof createAdminClient>,
  ownerId: string,
  state: SessionState
) {
  // Serialize per file. Two overlapping runs would read the same byte range
  // with a stale sequence base and assign wrong sequence numbers; the
  // rerun flag makes sure an event that arrived mid-run isn't dropped.
  if (state.inFlight) {
    state.rerun = true;
    return;
  }
  state.inFlight = true;
  try {
    do {
      state.rerun = false;
      await drainOnce(client, ownerId, state);
    } while (state.rerun);
  } finally {
    state.inFlight = false;
  }
}

async function drainOnce(
  client: ReturnType<typeof createAdminClient>,
  ownerId: string,
  state: SessionState
) {
  // Read only the bytes appended since the last successful batch.
  let chunk: Buffer;
  let mtimeMs: number;
  try {
    const handle = await open(state.filePath, "r");
    try {
      const st = await handle.stat();
      mtimeMs = st.mtimeMs;
      if (st.size < state.byteOffset) {
        // Truncation/rewrite — Claude Code isn't known to do this, but if it
        // happens, restart from byte 0. (session, sequence) upserts keep the
        // re-read idempotent.
        log(`file shrank, re-reading from byte 0: ${state.filePath}`);
        state.byteOffset = 0;
        state.partial = Buffer.alloc(0);
        state.lastSequence = 0;
      }
      if (st.size === state.byteOffset) return;
      const toRead = st.size - state.byteOffset;
      const buf = Buffer.alloc(toRead);
      const { bytesRead } = await handle.read(buf, 0, toRead, state.byteOffset);
      chunk = buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch (err) {
    log(`read failed for ${state.filePath}:`, err);
    return;
  }

  // Split at the last newline. \n is a single byte in UTF-8 (never part of a
  // multibyte sequence), so splitting at the buffer level can't corrupt
  // multibyte chars; the tail past the last newline is a mid-write partial
  // line, carried as bytes until it completes.
  const combined = Buffer.concat([state.partial, chunk]);
  const lastNewline = combined.lastIndexOf(0x0a);
  if (lastNewline === -1) {
    state.partial = Buffer.from(combined);
    state.byteOffset += chunk.length;
    return;
  }
  const completeLines = combined
    .subarray(0, lastNewline)
    .toString("utf-8")
    .split("\n");

  // Unmapped sessions: track liveness (the session row + heartbeats below)
  // but don't ingest transcript content. If a mapping rule is added later, a
  // bridge restart re-reads from byte 0 and backfills.
  const rowsToInsert: SessionMessageInsert[] = [];
  if (state.haloId !== null) {
    for (let i = 0; i < completeLines.length; i++) {
      const seq = state.lastSequence + i;
      const lineText = completeLines[i];
      if (!lineText.trim()) continue;
      const parsed: TranscriptLine | null = parseLine(lineText);
      if (!parsed) {
        // Insert a sentinel row instead of skipping silently. Advancing
        // lastSequence past this index would have permanently dropped the
        // event from the feed; the sentinel preserves the gap so the cockpit
        // can render "1 malformed event" rather than just lying.
        log(`malformed line at ${state.claudeSessionId}:${seq}`);
        rowsToInsert.push({
          owner_id: ownerId,
          session_id: state.rowId,
          sequence: seq,
          role: "malformed",
          content: {
            _error: "json_parse_failed",
            _raw: lineText.slice(0, 500),
          } as unknown as Json,
        });
        continue;
      }
      rowsToInsert.push({
        owner_id: ownerId,
        session_id: state.rowId,
        sequence: seq,
        role: normalizeRole(parsed),
        content: sanitizeForJsonb(parsed) as unknown as Json,
      });
    }
  }

  if (rowsToInsert.length > 0) {
    const { error } = await client
      .from("session_messages")
      .upsert(rowsToInsert, { onConflict: "session_id,sequence" });
    if (error) {
      log(`upsert session_messages failed for ${state.filePath}:`, error);
      // Don't advance any state — the next change event re-reads the same
      // byte range and retries.
      return;
    }
  }

  // Commit the batch only after the upsert landed.
  state.byteOffset += chunk.length;
  state.partial = Buffer.from(combined.subarray(lastNewline + 1));
  state.lastSequence += completeLines.length;

  // Heartbeat from the file's clock, not the wall clock: last_seen means
  // "the transcript last grew at this time", which also keeps the startup
  // catch-up over old transcripts from making them look freshly active.
  const isFresh = Date.now() - mtimeMs < IDLE_AFTER_MS;
  const { error: heartbeatError } = await client
    .from("claude_sessions")
    .update({
      last_seen: new Date(mtimeMs).toISOString(),
      ...(isFresh ? { status: "active" as const } : {}),
    })
    .eq("id", state.rowId);
  if (heartbeatError) {
    // Don't advance lastTouched — keep the next heartbeat timer eligible to
    // retry, otherwise the bridge thinks the row is fresh in DB when it
    // isn't and the cockpit shows stale last_seen.
    log(`heartbeat update failed for ${state.claudeSessionId}:`, heartbeatError);
    return;
  }
  state.lastTouched = mtimeMs;
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
    .eq("hostname", MACHINE)
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

  if (mapping.machine) {
    MACHINE = mapping.machine;
  } else {
    log(
      `WARNING: no "machine" in ${MAPPING_PATH} — falling back to ` +
        `os.hostname() ("${MACHINE}"), which changes with the network on ` +
        `laptops and would re-register sessions under a new machine name.`
    );
  }

  const client = createAdminClient(url, serviceKey);
  const ownerId = await resolveOwnerId(client, mapping.owner_email);
  log(`owner resolved: ${mapping.owner_email} → ${ownerId}`);
  log(`machine: ${MACHINE}`);
  log(`watching: ${PROJECTS_DIR}`);

  const watcher = chokidar.watch(PROJECTS_DIR, {
    persistent: true,
    ignoreInitial: false, // pick up files that already exist at startup
    depth: 2, // ~/.claude/projects/<encoded-cwd>/<session>.jsonl
    awaitWriteFinish: false,
    usePolling: USE_POLLING,
    interval: POLL_INTERVAL_MS,
    binaryInterval: POLL_INTERVAL_MS,
  });
  log(
    USE_POLLING
      ? `watch mode: stat-polling every ${POLL_INTERVAL_MS / 1000}s ` +
          `(inotify can't see writes from other NFS/Lustre clients; ` +
          `override with ATLAS_POLL=0)`
      : "watch mode: native fs events (override with ATLAS_POLL=1)"
  );

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
