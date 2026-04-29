import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { PROTOCOL_VERSION, enqueueAndAwaitResult } from "../bridge/protocol.js";
import { registerDiagnosticsTools } from "../tools/diagnosticsTools.js";
import { registerDocumentTools } from "../tools/documentTools.js";
import { registerLibraryTools } from "../tools/libraryTools.js";
import { registerStageTools } from "../tools/stageTools.js";
import { registerTimelineTools } from "../tools/timelineTools.js";

const SERVER_VERSION = "1.0.0";

/** Creates the Adobe Animate MCP server instance (stdio transport applied in index.ts). */
export function createAnimateMcpServer(): McpServer {
  const server = new McpServer({
    name: "AdobeAnimateMCP",
    version: SERVER_VERSION
  });

  registerDiagnosticsTools(server);
  registerDocumentTools(server);
  registerTimelineTools(server);
  registerLibraryTools(server);
  registerStageTools(server);

  server.resource(
    "animate_active_document",
    "animate://active-document",
    async () => {
      const result = await enqueueAndAwaitResult("animate_get_document_info", {});
      const textPayload =
        result.status === "completed"
          ? { protocolVersion: PROTOCOL_VERSION, result }
          : { protocolVersion: PROTOCOL_VERSION, result };
      return {
        contents: [
          {
            uri: "animate://active-document",
            mimeType: "application/json",
            text: JSON.stringify(textPayload, null, 2)
          }
        ]
      };
    }
  );

  server.prompt(
    "list-open-documents",
    "List open Adobe Animate FLA documents",
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "List all FLA/XFL documents currently open in Adobe Animate and summarize their dimensions and timelines."
          }
        }
      ]
    })
  );

  server.prompt(
    "export-current-document",
    "Export PNG or SVG snapshot from the active Animate document",
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Prepare and run animate_export_document with an explicit disk path suitable for previews (PNG or SVG)."
          }
        }
      ]
    })
  );

  server.prompt(
    "create-motion-tween",
    "Create a motion tween on the selection in Animate",
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Create a motion tween span on the selected symbol in Adobe Animate using animate_create_motion_tween with sane start/end frames."
          }
        }
      ]
    })
  );

  return server;
}
