import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

import { assertAllowedAnimateCommand } from "./commands.js";
import {
  ANIMATE_BRIDGE_DIR_NAME,
  commandFilePath,
  getBridgeQueueDir,
  logFilePath,
  resultFilePath,
  stateFilePath
} from "./paths.js";

export const PROTOCOL_VERSION = 1 as const;

export type BridgeCommandEnvelope = {
  protocolVersion: number;
  commandId: string;
  command: string;
  args: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "running" | "completed" | "error";
};

export type BridgeResultEnvelope =
  | {
      protocolVersion: number;
      commandId: string;
      command: string;
      status: "completed";
      data: unknown;
      error: null;
      startedAt: string | null;
      completedAt: string;
    }
  | {
      protocolVersion: number;
      commandId: string;
      command: string;
      status: "error";
      data: null;
      error: { message: string; detail?: unknown };
      startedAt: string | null;
      completedAt: string;
    };

export type BridgeHeartbeatState = {
  protocolVersion: number;
  lastHeartbeatISO: string;
  animateBridgeVersion?: string;
  animateVersion?: string;
  bridgePanelActive?: boolean;
  lastCommandExecuted?: string;
  extensionRootHintFromPanel?: string;
  bridgeJsflUriHintFromPanel?: string;
  bridgeJsflPlatformPathHintFromPanel?: string;
  bridgeQueueRootPlatformHintFromPanel?: string;
  notes?: string;
};

const DEFAULT_RESULT_TIMEOUT_MS = 120_000;
const DEFAULT_STALE_MS = 60_000;

function tryReadJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Drops old result files so the bridge folder stays small.
 * Important: Do not delete stale `command-*.json` by age alone — a client may wait up to DEFAULT_RESULT_TIMEOUT_MS
 * for bridge processing; pruning must never remove pending command files mid-wait.
 */
export function pruneStaleQueueFiles(
  queueDir: string,
  opts: { maxAgeMs: number }
): void {
  const now = Date.now();
  try {
    if (!fs.existsSync(queueDir)) return;
    const names = fs.readdirSync(queueDir);
    for (const name of names) {
      if (!name.startsWith("result-")) continue;
      const full = path.join(queueDir, name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > opts.maxAgeMs) {
          fs.unlinkSync(full);
        }
      } catch {
        /* ignore single file failures */
      }
    }
  } catch {
    /* ignore */
  }
}

export function enqueueCommand(
  command: string,
  args: Record<string, unknown> = {},
  options?: { queueDir?: string }
): { commandId: string; commandFile: string } {
  assertAllowedAnimateCommand(command);
  const queueDir = options?.queueDir ?? getBridgeQueueDir();
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }
  pruneStaleQueueFiles(queueDir, { maxAgeMs: DEFAULT_STALE_MS });

  const commandId = randomUUID();
  const envelope: BridgeCommandEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    commandId,
    command,
    args,
    createdAt: new Date().toISOString(),
    status: "pending"
  };

  const commandFile = commandFilePath(queueDir, commandId);
  fs.writeFileSync(commandFile, JSON.stringify(envelope, null, 2), "utf8");
  return { commandId, commandFile };
}

async function pollUntilResultReady(
  resultPath: string,
  deadlineMs: number,
  pollMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const stats = fs.statSync(resultPath);
        if (stats.size > 0) return true;
      } catch {
        /* transient */
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

/**
 * Writes command file and waits until result-{id}.json exists and is readable JSON matching commandId.
 */
export async function enqueueAndAwaitResult(
  command: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number; pollMs?: number; queueDir?: string }
): Promise<BridgeResultEnvelope> {
  const {
    timeoutMs = DEFAULT_RESULT_TIMEOUT_MS,
    pollMs = 200,
    queueDir: queueDirOpt
  } = opts ?? {};

  assertAllowedAnimateCommand(command);
  const queueDir = queueDirOpt ?? getBridgeQueueDir();
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }
  pruneStaleQueueFiles(queueDir, { maxAgeMs: DEFAULT_STALE_MS });

  const commandId = randomUUID();
  const envelope: BridgeCommandEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    commandId,
    command,
    args,
    createdAt: new Date().toISOString(),
    status: "pending"
  };
  const commandFile = commandFilePath(queueDir, commandId);
  fs.writeFileSync(commandFile, JSON.stringify(envelope, null, 2), "utf8");

  const resultPath = resultFilePath(queueDir, commandId);

  const ok = await pollUntilResultReady(resultPath, timeoutMs, pollMs);
  if (!ok) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      commandId,
      command,
      status: "error",
      data: null,
      error: {
        message: `Timed out after ${timeoutMs}ms waiting for bridge result.`,
        detail: {
          hint: `Open Window > Extensions > Adobe Animate MCP Bridge and ensure the panel is polling. Queue: ~/Documents/${ANIMATE_BRIDGE_DIR_NAME}/`,
          queueDir,
          resultPathExpected: resultPath
        }
      },
      startedAt: null,
      completedAt: new Date().toISOString()
    };
  }

  const parsed = tryReadJsonFile<BridgeResultEnvelope>(resultPath);
  if (!parsed || parsed.commandId !== commandId) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      commandId,
      command,
      status: "error",
      data: null,
      error: {
        message: "Bridge result invalid or mismatched commandId.",
        detail: parsed
      },
      startedAt: null,
      completedAt: new Date().toISOString()
    };
  }

  return parsed;
}

export function readBridgeStatusFromDisk(): BridgeHeartbeatState | null {
  const queueDir = getBridgeQueueDir();
  return tryReadJsonFile<BridgeHeartbeatState>(stateFilePath(queueDir));
}

/**
 * Interprets whether the panel looks healthy from state.json age.
 */
export function evaluateBridgeHealth(state: BridgeHeartbeatState | null): {
  healthy: boolean;
  reason?: string;
  lastHeartbeatISO?: string;
} {
  if (!state || !state.lastHeartbeatISO) {
    return {
      healthy: false,
      reason:
        "No state.json from the Animate CEP bridge. Install the extension and open Window > Extensions > Adobe Animate MCP Bridge."
    };
  }
  const t = Date.parse(state.lastHeartbeatISO);
  if (Number.isNaN(t)) {
    return { healthy: false, reason: "state.json has invalid lastHeartbeatISO." };
  }
  const ageMs = Date.now() - t;
  const maxMs = 45_000;
  if (ageMs > maxMs) {
    return {
      healthy: false,
      reason: `Last heartbeat is stale (${Math.round(ageMs / 1000)}s ago; expected < ${maxMs / 1000}s).`,
      lastHeartbeatISO: state.lastHeartbeatISO
    };
  }
  return { healthy: true, lastHeartbeatISO: state.lastHeartbeatISO };
}

export function readResultFileById(commandId: string): BridgeResultEnvelope | null {
  const queueDir = getBridgeQueueDir();
  return tryReadJsonFile<BridgeResultEnvelope>(resultFilePath(queueDir, commandId));
}

export function readLatestResultFile(): { file: string; result: BridgeResultEnvelope } | null {
  const queueDir = getBridgeQueueDir();
  if (!fs.existsSync(queueDir)) return null;
  const names = fs.readdirSync(queueDir).filter((n) => n.startsWith("result-") && n.endsWith(".json"));
  if (names.length === 0) return null;
  const withMtime = names
    .map((n) => {
      const full = path.join(queueDir, n);
      try {
        return { name: n, full, mtime: fs.statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((x): x is { name: string; full: string; mtime: number } => x !== null)
    .sort((a, b) => b.mtime - a.mtime);
  if (withMtime.length === 0) return null;
  const top = withMtime[0]!;
  const parsed = tryReadJsonFile<BridgeResultEnvelope>(top.full);
  if (!parsed) return null;
  return { file: top.full, result: parsed };
}

export function readBridgeLogTail(maxBytes = 16_384): string | null {
  const p = logFilePath(getBridgeQueueDir());
  if (!fs.existsSync(p)) return null;
  try {
    const buf = fs.readFileSync(p);
    if (buf.length <= maxBytes) return buf.toString("utf8");
    return buf.subarray(buf.length - maxBytes).toString("utf8");
  } catch {
    return null;
  }
}
