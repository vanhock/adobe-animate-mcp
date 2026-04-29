import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { enqueueAndAwaitResult } from "../bridge/protocol.js";
import { DocumentNameOpt, LayerTarget, LibraryPathString, SceneIndexOneBased } from "../schemas/common.js";

import { jsonText } from "./toolUtils.js";

export function registerLibraryTools(server: McpServer): void {
  server.tool(
    "animate_list_library_items",
    "Enumerate library items optionally filtered by folder.",
    (
      DocumentNameOpt.merge(
        z.object({
          folderOnly: z.boolean().optional(),
          recursive: z.boolean().optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_list_library_items", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_symbol_from_selection",
    "Convert current selection to a new library symbol.",
    (
      DocumentNameOpt.merge(
        z.object({
          name: z.string().min(1),
          registrationPoint: z.enum(["TOP_LEFT", "CENTER"]).optional(),
          symbolType: z.enum(["movie clip", "graphic", "button"])
        })
      )
    ).shape,
    async (args) =>
      jsonText(
        await enqueueAndAwaitResult("animate_create_symbol_from_selection", args as Record<string, unknown>)
      )
  );

  server.tool(
    "animate_create_empty_symbol",
    "Create an empty MovieClip/Button/Graphic in the Library.",
    (
      DocumentNameOpt.merge(
        z.object({
          name: z.string().min(1),
          symbolType: z.enum(["movie clip", "graphic", "button"])
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_empty_symbol", args as Record<string, unknown>))
  );

  server.tool(
    "animate_place_library_item",
    "Place an existing library asset on the Stage at x,y.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial())
        .merge(LayerTarget)
        .merge(
          z.object({
            libraryPath: LibraryPathString,
            x: z.number(),
            y: z.number()
          })
        )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_place_library_item", args as Record<string, unknown>))
  );

  server.tool(
    "animate_rename_library_item",
    "Rename a library item referenced by slash path.",
    (
      DocumentNameOpt.merge(
        z.object({
          libraryPath: LibraryPathString,
          newName: z.string().min(1)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_rename_library_item", args as Record<string, unknown>))
  );

  server.tool(
    "animate_delete_library_item",
    "Delete a library item by path.",
    DocumentNameOpt.merge(z.object({ libraryPath: LibraryPathString })).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_delete_library_item", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_library_folder",
    "Create folders in Library (slash-separated hierarchy).",
    DocumentNameOpt.merge(z.object({ folderPath: z.string().min(1).describe('"folder/sub"') })).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_library_folder", args as Record<string, unknown>))
  );
}
