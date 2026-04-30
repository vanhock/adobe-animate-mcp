# Adobe Animate MCP

Model Context Protocol (MCP) server for **Adobe Animate**. A small **CEP panel** polls a filesystem queue under `~/Documents/animate-mcp-bridge/` and runs **JSFL** so Node.js MCP tools can drive the open FLA.

## Requirements

- **Node.js** 18+ (20+ recommended)
- **Adobe Animate** with CEP support
- The **Adobe Animate MCP Bridge** CEP extension installed and open while you use MCP

## Install

```bash
npm install
npm run build
npm run install-extension
```

`install-extension` copies `build/extension/com.adobe.animatemcp.bridge` into your user CEP extensions folder:

- **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/`
- **Windows:** `%APPDATA%\Adobe\CEP\extensions\`

### Unsigned extensions (CEP debug)

If the panel does not appear, enable debug mode for your CSXS line (version must match your Animate/CEP stack), then restart Animate. Example for **CSXS.11** on macOS:

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

On Windows, add a `DWORD` `PlayerDebugMode` = `1` under the corresponding `HKEY_CURRENT_USER\Software\Adobe\CSXS.<N>` key (see Adobe CEP documentation).

## MCP client configuration

Point your MCP host at the built server (`build/index.js`). This repo ships a template [`.mcp.json`](./.mcp.json); replace `/ABSOLUTE/PATH/TO/adobe-animate-mcp` with your clone path:

```json
{
  "mcpServers": {
    "AdobeAnimateMCP": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/adobe-animate-mcp/build/index.js"]
    }
  }
}
```

## Usage

1. Open **Adobe Animate** and load an FLA.
2. Open **Window > Extensions > Adobe Animate MCP Bridge** and leave the panel open (it polls the queue and calls `heartbeat`).
3. Start your MCP client so it launches `build/index.js` over stdio.
4. Invoke tools such as `animate_get_document_info` or `animate_list_layers`. The server writes `command-<uuid>.json` into `~/Documents/animate-mcp-bridge/`; the panel runs JSFL to process pending files and writes `result-<uuid>.json`.

### Diagnostics

- `animate_bridge_status` — heartbeat from `state.json` and hints if the bridge is stale.
- `animate_get_help` — command list surfaced to the MCP client.

### Geometry reads and frame snapshots

Use structured reads as the source of truth for poses; use snapshots to visually verify renders (especially tween midpoints).

- **`animate_list_frame_elements`** — returns every element on a layer frame with `elementIndex`, `x`, `y`, `width`, `height`, `rotationDeg`, optional `matrix`, `libraryItemName`, etc. Same layer/frame targeting as **`animate_set_element_properties`** (`layerIndex` defaults to **1** when omitted).
- **`animate_get_element_properties`** — reads one element by **`elementIndex`** on that layer/frame.
- **`animate_export_frame_snapshot`** — writes **PNG** or **SVG** for the Stage at **`sceneIndex`** + **`frameNumber`**, then restores the document’s previous timeline and frame so authoring context does not drift.

**Limits:** Values match **keyframes** reliably; tween midpoint geometry vs **Properties** may differ by document type — validate in Animate. Snapshots prove visual output but do not replace numeric geometry for automation.

### Troubleshooting

- **`animate_bridge_status` not healthy — no `state.json`:** reopen **Window → Extensions → Adobe Animate MCP Bridge** and reinstall the extension (`npm run build && npm run install-extension`) after CEP tweaks; enable PlayerDebugMode for unsigned panels (see above).
- **MCP calls time out (~2 min)** while **`queueSnapshot.pendingCommands` stays `1`** in **`animate_bridge_status`:** JSFL usually did not consume the queue — panel closed, ExtendScript failing, or mismatched **`~/Documents/animate-mcp-bridge`** (Node writes here; **`logs.txt`** in the same folder has JSFL lines). Rebuild reinstall so **`host/bridge.jsfl`** exists next to **`client/`** inside the bundle.
- **Cursor / MCP stalls or long waits:** the client interrupting requests is unrelated to Node; retry when Animate has focus with the bridge panel visibly updating.
- **Panel is blank (no task list):** run **`npm run build && npm run install-extension`**, quit Animate, reopen **Window → Extensions → Adobe Animate MCP Bridge**. You should see **MCP tasks** (empty until the first tool call) and a **JSFL** strip with heartbeat info once `state.json` exists. If it stays empty, copy **`build/extension/com.adobe.animatemcp.bridge`** manually into your CEP extensions folder (see Install).

### CEP panel remote debugging

The built bundle includes **`.debug`** next to **`CSXS/`** declaring `<Host Name="FLPR" Port="8708"/>`. With **PlayerDebugMode** enabled (see above), restart Animate, open the bridge panel, then in Chrome open **`http://127.0.0.1:8708`** — select the Adobe Animate MCP Bridge target to inspect the panel (**Console**, DOM under **`#task-list`**, ExtendScript callbacks). Confirm the port matches `build/extension/com.adobe.animatemcp.bridge/.debug` if debugging fails.

### If `heartbeat` never creates `state.json` (fallback)

The panel resolves **`bridge.jsfl`** via a **`file:///` URI with percent-encoded path segments** (`Application%20Support`, …). If **`fl.runScript(fileUri, ...)` still fails**, set **`LOAD_INLINE_JSFL = true`** near the top of **`src/cep/client/js/main.js`**, then **`npm run build`**, **`npm run install-extension`**, restart Animate — the panel reads **`host/bridge.jsfl`** via **`cep.fs.readFile`** and runs it in one **`evalScript`** together with **`heartbeat`** / **`pollOnePendingCommand`** (heavier CPU than `fl.runScript`).

## Developing

```bash
npm run build
npm test
npm run typecheck
```

`npm run typecheck` bundles the TypeScript entry with esbuild (fast sanity check).

Full **`tsc` semantic checking** (`npm run typecheck:tsc`) may use multiple GB of RAM because of MCP SDK + Zod inference; skip it if your machine hits **JavaScript heap out of memory**.

## Manual smoke checklist (Adobe Animate)

Use this when verifying a real installation (not automated in CI):

1. Build and install the extension (`npm run build`, `npm run install-extension`). Restart Animate.
2. Open the bridge panel — the top strip should show **heartbeat** timing once `state.json` exists; call any MCP tool and confirm a row appears under **MCP tasks** (status pending → running → completed) and `logs.txt` updates when JSFL runs.
3. From a terminal MCP client or test harness, call `animate_bridge_status` — expect `healthy` when the panel runs.
4. With a document open, call `animate_get_document_info` and confirm structured document metadata returns without timeout.
5. On a layer with content at frame **1**, call **`animate_list_frame_elements`** (`frameNumber: 1`) — confirm **`elementIndex`** and **`x`/`y`/`rotationDeg`** align with **Properties** for a keyframe.
6. Call **`animate_get_element_properties`** with the same targeting and one **`elementIndex`** from step 5 — confirm it matches that list entry.
7. Call **`animate_export_frame_snapshot`** with an absolute **`outputPathPlatform`** — confirm the file appears and matches the Stage at that frame; confirm the timeline playhead returns where it was before the call.

## License

MIT — see [LICENSE](./LICENSE).
