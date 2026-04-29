import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { enqueueAndAwaitResult } from "../bridge/protocol.js";
import { DocumentNameOpt, OutputPathOptional } from "../schemas/common.js";

import { jsonText } from "./toolUtils.js";

export function registerDocumentTools(server: McpServer): void {
  server.tool(
    "animate_list_documents",
    "List FLA/XFL documents currently open in Animate.",
    {},
    async () => jsonText(await enqueueAndAwaitResult("animate_list_documents", {}))
  );

  server.tool(
    "animate_get_document_info",
    "Get dimensions, FPS, timelines, publish profile hints for a document.",
    DocumentNameOpt.shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_get_document_info", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_document",
    "Create a new Animate FLA (`profile` defaults to HTML Canvas if omitted).",
    z
      .object({
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        frameRate: z.number().positive().optional(),
        backgroundColorHex: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/)
          .optional(),
        profile: z.string().optional().describe("Publish profile name, e.g. HTML Canvas, ActionScript 3.0")
      })
      .shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_document", args as Record<string, unknown>))
  );

  server.tool(
    "animate_open_document",
    "Open a FLA from disk (file:/// URI preferred).",
    z.object({
      fileUri: z.string().describe("file:/// URI to .fla")
    }).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_open_document", args as Record<string, unknown>))
  );

  server.tool(
    "animate_save_document",
    "Save the active document. Use saveAsPlatformPath for Save As.",
    z
      .object({
        documentName: z.string().optional(),
        saveAsPlatformPath: z.string().optional().describe("Absolute platform path on disk (.fla)")
      })
      .shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_save_document", args as Record<string, unknown>))
  );

  server.tool(
    "animate_close_document",
    "Close a document.",
    z
      .object({
        documentName: z.string().optional(),
        closeWithoutPromptIfPossible: z.boolean().optional()
      })
      .shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_close_document", args as Record<string, unknown>))
  );

  server.tool(
    "animate_publish_document",
    "Publish using the active Publish Settings profile.",
    DocumentNameOpt.shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_publish_document", args as Record<string, unknown>))
  );

  server.tool(
    "animate_export_document",
    "Export PNG sequence, SVG, SWF, or video depending on `format`.",
    (
      z
        .object({
          documentName: z.string().optional(),
          format: z.enum(["PNG", "SVG", "SWF", "VIDEO"])
        })
        .merge(OutputPathOptional.partial())
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_export_document", args as Record<string, unknown>))
  );
}
