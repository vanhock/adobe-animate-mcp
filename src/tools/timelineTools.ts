import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { enqueueAndAwaitResult } from "../bridge/protocol.js";
import {
  DocumentNameOpt,
  FrameNumOneBased,
  LayerTarget,
  SceneIndexOneBased
} from "../schemas/common.js";

import { jsonText } from "./toolUtils.js";

export function registerTimelineTools(server: McpServer): void {
  server.tool(
    "animate_list_scenes",
    "List scenes (timelines) in the active or named document.",
    DocumentNameOpt.shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_list_scenes", args as Record<string, unknown>))
  );

  server.tool(
    "animate_add_scene",
    "Add a new scene after the current scene.",
    DocumentNameOpt.shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_add_scene", args as Record<string, unknown>))
  );

  server.tool(
    "animate_rename_scene",
    "Rename an existing scene.",
    z
      .object({
        sceneIndex: z.number().int().min(1).describe("1-based scene index"),
        newSceneName: z.string().min(1)
      })
      .shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_rename_scene", args as Record<string, unknown>))
  );

  server.tool(
    "animate_set_active_scene",
    "Make sceneIndex (1-based) the active/edited scene.",
    (
      DocumentNameOpt.merge(
        z.object({
          sceneIndex: z.number().int().min(1).describe("1-based scene index (matches Scenes panel order)")
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_set_active_scene", args as Record<string, unknown>))
  );

  server.tool(
    "animate_list_layers",
    "List layers in the active scene/timeline.",
    DocumentNameOpt.merge(SceneIndexOneBased.partial()).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_list_layers", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_layer",
    "Create a layer in the active timeline.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(
        z.object({
          name: z.string().optional(),
          layerType: z.enum(["normal", "guide", "mask", "masked", "folder"]).default("normal")
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_layer", args as Record<string, unknown>))
  );

  server.tool(
    "animate_rename_layer",
    "Rename a layer by index or name.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial())
        .merge(LayerTarget)
        .merge(z.object({ newName: z.string().min(1) }))
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_rename_layer", args as Record<string, unknown>))
  );

  server.tool(
    "animate_reorder_layer",
    "Reorder a layer to zero-based destination index (`newLayerIndex`), Animate layering order.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial())
        .merge(LayerTarget)
        .merge(z.object({ newLayerIndexZeroBased: z.number().int().min(0) }))
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_reorder_layer", args as Record<string, unknown>))
  );

  server.tool(
    "animate_delete_layer",
    "Delete a layer by index or name.",
    DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_delete_layer", args as Record<string, unknown>))
  );

  server.tool(
    "animate_set_layer_properties",
    "Set visibility, locking, outline, color, parenting on the active layer.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          visible: z.boolean().optional(),
          locked: z.boolean().optional(),
          outline: z.boolean().optional(),
          color: z.string().optional(),
          parentLayerIndex: z.number().int().min(1).optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_set_layer_properties", args as Record<string, unknown>))
  );

  /** Frames */

  server.tool(
    "animate_list_frames",
    "List frame metadata for first N frames starting at frameNumber.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial())
        .merge(LayerTarget)
        .merge(
          z.object({
            startFrameNumber: z.number().int().min(1).default(1),
            frameCount: z.number().int().positive().optional()
          })
        )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_list_frames", args as Record<string, unknown>))
  );

  server.tool(
    "animate_insert_frame",
    "Insert frames at zero-based insertion index.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial())
        .merge(LayerTarget)
        .merge(
          z.object({
            count: z.number().int().positive().default(1),
            atFrameIndexZeroBased: z.number().int().min(0),
            allLayers: z
              .boolean()
              .optional()
              .describe("When true, insert into every layer (extends whole timeline).")
          })
        )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_insert_frame", args as Record<string, unknown>))
  );

  server.tool(
    "animate_insert_keyframe",
    "Insert a keyframe at a 1-based frame number.",
    DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(FrameNumOneBased).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_insert_keyframe", args as Record<string, unknown>))
  );

  server.tool(
    "animate_insert_blank_keyframe",
    "Insert blank keyframe(s) beginning at frameNumber.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          frameNumber: z.number().int().min(1),
          count: z.number().int().positive().default(1)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_insert_blank_keyframe", args as Record<string, unknown>))
  );

  server.tool(
    "animate_clear_frames",
    "Clear content in a frame range.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          startFrameNumber: z.number().int().min(1),
          endFrameNumber: z.number().int().min(1)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_clear_frames", args as Record<string, unknown>))
  );

  server.tool(
    "animate_set_frame_label",
    "Assign a frame label (use frame labels instead of frame numbers in authoring).",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          frameNumber: z.number().int().min(1),
          label: z.string(),
          annotation: z.enum(["NONE", "ANNOTATION"]).optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_set_frame_label", args as Record<string, unknown>))
  );

  server.tool(
    "animate_set_frame_action_script",
    "Set ActionScript/HTML5 Canvas frame scripts for a classic-tween-compatible layer.",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          frameNumber: z.number().int().min(1),
          script: z.string(),
          scriptingLanguageHint: z.enum(["AS", "CANVAS"]).optional()
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_set_frame_action_script", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_classic_tween",
    "Create a classic tween between two keyframes (uses timeline.createMotionTween).",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          startFrameNumber: z.number().int().min(1),
          endFrameNumber: z.number().int().min(1)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_classic_tween", args as Record<string, unknown>))
  );

  server.tool(
    "animate_create_motion_tween",
    "Create a modern motion tween span (uses timeline.createMotionObject).",
    (
      DocumentNameOpt.merge(SceneIndexOneBased.partial()).merge(LayerTarget).merge(
        z.object({
          startFrameNumber: z.number().int().min(1),
          endFrameNumber: z.number().int().min(1)
        })
      )
    ).shape,
    async (args) =>
      jsonText(await enqueueAndAwaitResult("animate_create_motion_tween", args as Record<string, unknown>))
  );
}
