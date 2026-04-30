import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { enqueueAndAwaitResult } from "../bridge/protocol.js";
import { BoundsSchema, DocumentNameOpt, HexColor, LayerTarget, PointSchema, SceneIndexOneBased } from "../schemas/common.js";

import { jsonText } from "./toolUtils.js";

export function registerStageTools(server: McpServer): void {
  server.tool(
    "animate_create_text",
    "Create a static text field on the Stage.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(
        z.object({
          text: z.string(),
          x: z.number(),
          y: z.number(),
          width: z.number().optional(),
          height: z.number().optional(),
          font: z.string().optional(),
          size: z.number().optional(),
          colorHex: HexColor.optional(),
          alignment: z.enum(["left", "center", "right", "justify"]).optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_text", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_rectangle",
    "Create a rectangle shape with optional corner radius.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(
        z.object({
          bounds: BoundsSchema,
          cornerRadius: z.number().optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_rectangle", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_oval",
    "Create an oval or ellipse shape.",
    (DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(z.object({ bounds: BoundsSchema }))).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_oval", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_line",
    "Create a line between two points.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(
        z.object({
          from: PointSchema,
          to: PointSchema,
          strokeWidth: z.number().optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_line", args as Record<string, unknown>))
  );

  server.tool(
    "animate_set_element_properties",
    "Set transform on Stage selection, or on a timeline element via layer + frameNumber + elementIndex (no selection).",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          frameNumber: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("1-based frame; with elementIndex targets that frame on the layer (bridge reads elements)."),
          elementIndex: z.number().int().min(0).optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          rotationDeg: z.number().optional(),
          alphaPercent: z.number().min(0).max(100).optional(),
          blendMode: z.string().optional(),
          name: z.string().optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_set_element_properties", args as Record<string, unknown>))
  );

  server.tool(
    "animate_list_frame_elements",
    "List Stage elements on a layer frame with geometry snapshots (elementIndex aligns with animate_set_element_properties).",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          frameNumber: z.number().int().min(1),
          includeMatrix: z.boolean().optional().default(true)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_list_frame_elements", args as Record<string, unknown>))
  );

  server.tool(
    "animate_get_element_properties",
    "Read transform and identity for one timeline element (same targeting as animate_set_element_properties).",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          frameNumber: z.number().int().min(1),
          elementIndex: z.number().int().min(0),
          includeMatrix: z.boolean().optional().default(true)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_get_element_properties", args as Record<string, unknown>))
  );

  server.tool(
    "animate_set_filters",
    "Apply Adobe filter objects from Animate`s filter vocabulary (opaque JSON blobs).",
    (
      DocumentNameOpt.merge(
        z.object({
          filters: z.array(z.record(z.string(), z.unknown()))
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_set_filters", args as Record<string, unknown>))
  );

  server.tool(
    "animate_select_elements",
    "Programmatic Stage selection helpers.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(
        z.object({
          layerIndex: z.number().int().min(1).optional(),
          layerName: z.string().optional(),
          frameNumber: z.number().int().min(1),
          elementIndex: z.number().int().min(0),
          additive: z.boolean().optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_select_elements", args as Record<string, unknown>))
  );

  server.tool(
    "animate_delete_selection",
    "Deletes the active selection.",
    DocumentNameOpt.merge(SceneIndexOneBased.partial()).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_delete_selection", args as Record<string, unknown>))
  );
}
