/** Shared MCP response helper for structured bridge JSON. */

export function jsonText(obj: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }]
  };
}
