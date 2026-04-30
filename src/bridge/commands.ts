/**
 * Single source of truth: MCP tools and JSFL dispatch MUST use identical command IDs.
 */

export const ANIMATE_BRIDGE_COMMAND_IDS = [
  // Diagnostics / bridge
  "animate_bridge_status",
  "animate_get_help",
  "animate_get_results",
  // Documents
  "animate_list_documents",
  "animate_get_document_info",
  "animate_create_document",
  "animate_open_document",
  "animate_save_document",
  "animate_close_document",
  "animate_publish_document",
  "animate_export_document",
  "animate_export_frame_snapshot",
  // Scenes / timelines
  "animate_list_scenes",
  "animate_add_scene",
  "animate_rename_scene",
  "animate_set_active_scene",
  // Layers
  "animate_list_layers",
  "animate_create_layer",
  "animate_rename_layer",
  "animate_reorder_layer",
  "animate_delete_layer",
  "animate_set_layer_properties",
  // Frames & tweens
  "animate_list_frames",
  "animate_insert_frame",
  "animate_insert_keyframe",
  "animate_insert_blank_keyframe",
  "animate_clear_frames",
  "animate_set_frame_label",
  "animate_set_frame_action_script",
  "animate_create_classic_tween",
  "animate_create_motion_tween",
  // Library / symbols
  "animate_list_library_items",
  "animate_create_symbol_from_selection",
  "animate_create_empty_symbol",
  "animate_place_library_item",
  "animate_rename_library_item",
  "animate_delete_library_item",
  "animate_create_library_folder",
  // Stage / elements
  "animate_create_text",
  "animate_create_rectangle",
  "animate_create_oval",
  "animate_create_line",
  "animate_set_element_properties",
  "animate_set_filters",
  "animate_select_elements",
  "animate_delete_selection",
  "animate_list_frame_elements",
  "animate_get_element_properties",
  /** Safe named modules under host/commands/named/*.jsfl */
  "animate_run_named_script"
] as const;

export type AnimateBridgeCommandId = (typeof ANIMATE_BRIDGE_COMMAND_IDS)[number];

/** Node-side allowlist lookup. JSFL repeats the same set. */
export const ANIMATE_BRIDGE_COMMAND_SET: ReadonlySet<string> = new Set<string>(
  ANIMATE_BRIDGE_COMMAND_IDS as unknown as string[]
);

export function assertAllowedAnimateCommand(command: string): asserts command is AnimateBridgeCommandId {
  if (!ANIMATE_BRIDGE_COMMAND_SET.has(command)) {
    throw new Error(`Invalid bridge command "${command}". Not in ANIMATE_BRIDGE_COMMAND_IDS allowlist.`);
  }
}

/** Safe named-command scripts bundled under extension host/commands/named/*.jsfl */
export const ANIMATE_ALLOWED_NAMED_SCRIPTS = [
  "heartbeat_smoke_test"
] as const;
