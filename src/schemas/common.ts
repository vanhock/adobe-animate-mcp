import { z } from "zod";

export const DocumentNameOpt = z.object({
  documentName: z.string().optional().describe("Target document base name without path; defaults to active document")
});

export const SceneIndexOneBased = z.object({
  sceneIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based scene index (matches Scenes panel order)")
});

export const LayerTarget = z.object({
  layerIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based layer index inside the active timeline (top = index 1)"),
  layerName: z.string().optional()
});

export const FrameNumOneBased = z.object({
  frameNumber: z
    .number()
    .int()
    .min(1)
    .describe("1-based timeline frame number (UI frame number)")
});

export const PointSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const BoundsSchema = z.object({
  left: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number()
});

export const OutputPathOptional = z.object({
  outputPathPlatform: z
    .string()
    .optional()
    .describe(
      "Absolute platform path where export output is written; required unless format allows default"
    ),
  pngOptions: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional export flags passed to Adobe JSFL export calls when relevant")
});

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/);

export const LibraryPathString = z
  .string()
  .min(1)
  .describe("Library path separated by slashes, e.g. \"folder/subfolder/SymbolName\"");

export const FileUriOpt = z.object({
  fileUri: z.string().optional()
});
