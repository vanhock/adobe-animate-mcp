import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { ANIMATE_ALLOWED_NAMED_SCRIPTS } from "../bridge/commands.js";
import {
  enqueueAndAwaitResult,
  evaluateBridgeHealth,
  readBridgeLogTail,
  readBridgeStatusFromDisk,
  readLatestResultFile,
  readResultFileById
} from "../bridge/protocol.js";
import { getBridgeQueueDir } from "../bridge/paths.js";

const HELP_TEXT = `# Adobe Animate MCP

## Requirements
- Adobe Animate 2020+ with CEP extensions enabled
- Node.js 18+
- This MCP server (stdio) and the CEP panel **Adobe Animate MCP Bridge** open in Animate

## Setup
1. npm install and npm run build
2. npm run install-extension — copies extension to user CEP folder
3. Enable PlayerDebugMode for unsigned extensions during development — see README
4. Restart Animate, then Window > Extensions > Adobe Animate MCP Bridge

## Bridge queue
Commands are JSON files under ~/Documents/animate-mcp-bridge/:
- command-<uuid>.json — written by Node, consumed by panel
- result-<uuid>.json — written by JSFL, read by Node
- state.json — heartbeat from panel + Animate via JSFL
- logs.txt — append-only diagnostics

## Indexing conventions
Public MCP arguments use 1-based scene indices and 1-based frame numbers when documented; JSFL uses 0-based frame indices internally.

## Tool families
Diagnostics, Documents, Scenes, Layers, Frames, Library, Stage — including geometry reads (\`animate_list_frame_elements\`, \`animate_get_element_properties\`) and frame snapshots (\`animate_export_frame_snapshot\`). See README for full list.
`;

function queueSnapshot(queueDir: string): {
  commandFiles: number;
  pendingCommands: number;
  resultFiles: number;
} {
  try {
    if (!fs.existsSync(queueDir)) {
      return { commandFiles: 0, pendingCommands: 0, resultFiles: 0 };
    }
    let commandFiles = 0;
    let pendingCommands = 0;
    let resultFiles = 0;
    for (const name of fs.readdirSync(queueDir)) {
      if (!name.endsWith(".json")) continue;
      if (name.startsWith("command-")) {
        commandFiles += 1;
        try {
          const raw = fs.readFileSync(path.join(queueDir, name), "utf8");
          const parsed = JSON.parse(raw) as { status?: string };
          if (parsed.status === "pending") pendingCommands += 1;
        } catch {
          /* ignore malformed */
        }
      } else if (name.startsWith("result-")) {
        resultFiles += 1;
      }
    }
    return { commandFiles, pendingCommands, resultFiles };
  } catch {
    return { commandFiles: 0, pendingCommands: 0, resultFiles: 0 };
  }
}

function textResult(obj: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }]
  };
}

export function registerDiagnosticsTools(server: McpServer): void {
  server.tool(
    "animate_bridge_status",
    "Report whether the Animate CEP bridge panel is healthy (reads ~/Documents/animate-mcp-bridge/state.json).",
    {},
    async () => {
      const state = readBridgeStatusFromDisk();
      const queueDirRes = getBridgeQueueDir();
      const snap = queueSnapshot(queueDirRes);
      const health = evaluateBridgeHealth(state);
      return textResult({
        healthy: health.healthy,
        reason: health.reason,
        lastHeartbeatISO: health.lastHeartbeatISO ?? state?.lastHeartbeatISO,
        state,
        queueDir: queueDirRes,
        queueHint: "~/Documents/animate-mcp-bridge/",
        queueSnapshot: snap,
        logTail: readBridgeLogTail(6000)
      });
    }
  );

  server.tool(
    "animate_get_help",
    "Markdown help for Adobe Animate MCP: requirements, setup, tool families, and indexing rules.",
    {},
    async () => textResult(HELP_TEXT)
  );

  server.tool(
    "animate_get_results",
    "Read a bridge result JSON file by commandId, or the latest result if commandId is omitted.",
    z
      .object({
        commandId: z.string().uuid().optional().describe("Optional UUID of a prior command file result-*.json")
      })
      .shape,
    async ({ commandId }) => {
      if (commandId) {
        const r = readResultFileById(commandId);
        if (!r) return textResult({ error: "Result not found.", commandId });
        return textResult(r);
      }
      const latest = readLatestResultFile();
      if (!latest) return textResult({ message: "No result files found in the bridge queue directory." });
      return textResult({ file: latest.file, result: latest.result });
    }
  );

  server.tool(
    "animate_run_named_script",
    "Run a bundled allowlisted JSFL file from the extension host/commands/named folder (safe path).",
    z
      .object({
        scriptName: z.enum(
          ANIMATE_ALLOWED_NAMED_SCRIPTS as unknown as [string, ...string[]]
        ),
        args: z.record(z.string(), z.unknown()).optional()
      })
      .shape,
    async ({ scriptName, args = {} }) => {
      const r = await enqueueAndAwaitResult("animate_run_named_script", { scriptName, args });
      return textResult(r);
    }
  );
}
