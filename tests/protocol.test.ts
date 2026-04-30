import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  enqueueCommand,
  evaluateBridgeHealth,
  pruneStaleQueueFiles,
  type BridgeHeartbeatState
} from "../src/bridge/protocol.js";

describe("bridge protocol", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "animate-mcp-proto-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("enqueueCommand writes a pending envelope", () => {
    const { commandId, commandFile } = enqueueCommand(
      "animate_bridge_status",
      {},
      { queueDir: tmpDir }
    );
    assert.match(commandId, /^[0-9a-f-]{36}$/i);
    assert.equal(commandFile, path.join(tmpDir, `command-${commandId}.json`));
    const raw = fs.readFileSync(commandFile, "utf8");
    const env = JSON.parse(raw) as { status: string; command: string };
    assert.equal(env.status, "pending");
    assert.equal(env.command, "animate_bridge_status");
  });

  it("pruneStaleQueueFiles removes old result files only", () => {
    const oldResult = path.join(tmpDir, "result-old.json");
    fs.writeFileSync(oldResult, "{}", "utf8");
    const stamp = Date.now() - 120_000;
    fs.utimesSync(oldResult, new Date(stamp), new Date(stamp));

    const commandPath = path.join(tmpDir, "command-stale-not-deleted-by-age.json");
    fs.writeFileSync(commandPath, "{}", "utf8");
    fs.utimesSync(commandPath, new Date(stamp), new Date(stamp));

    pruneStaleQueueFiles(tmpDir, { maxAgeMs: 60_000 });
    assert.equal(fs.existsSync(oldResult), false);
    assert.equal(fs.existsSync(commandPath), true);
  });

  it("evaluateBridgeHealth accepts a recent ISO-8601 lastHeartbeatISO", () => {
    const now = new Date().toISOString();
    const r = evaluateBridgeHealth({
      protocolVersion: 1,
      lastHeartbeatISO: now
    } as BridgeHeartbeatState);
    assert.equal(r.healthy, true);
  });

  it("enqueueCommand accepts animate_list_frame_elements", () => {
    const { commandFile } = enqueueCommand(
      "animate_list_frame_elements",
      { frameNumber: 1 },
      { queueDir: tmpDir }
    );
    const raw = fs.readFileSync(commandFile, "utf8");
    const env = JSON.parse(raw) as { command: string };
    assert.equal(env.command, "animate_list_frame_elements");
  });

  it("enqueueCommand accepts animate_export_frame_snapshot", () => {
    const { commandFile } = enqueueCommand(
      "animate_export_frame_snapshot",
      { frameNumber: 1, outputPathPlatform: "/tmp/frame.png", format: "PNG" },
      { queueDir: tmpDir }
    );
    const raw = fs.readFileSync(commandFile, "utf8");
    const env = JSON.parse(raw) as { command: string };
    assert.equal(env.command, "animate_export_frame_snapshot");
  });

  it("enqueueCommand rejects unknown bridge commands", () => {
    assert.throws(
      () => enqueueCommand("animate_nonexistent_command", {}, { queueDir: tmpDir }),
      /Invalid bridge command/
    );
  });

  it("evaluateBridgeHealth rejects millis-only lastHeartbeatISO (JSFL fallback bug)", () => {
    const r = evaluateBridgeHealth({
      protocolVersion: 1,
      lastHeartbeatISO: "1777494010326"
    } as BridgeHeartbeatState);
    assert.equal(r.healthy, false);
    assert.match(String(r.reason), /invalid lastHeartbeatISO/);
  });
});
