import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const ANIMATE_BRIDGE_DIR_NAME = "animate-mcp-bridge";

/** User Documents queue directory (~/{Documents}/animate-mcp-bridge). */
export function getBridgeQueueDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, "Documents", ANIMATE_BRIDGE_DIR_NAME);
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}

export function commandFilePath(queueDir: string, commandId: string): string {
  return path.join(queueDir, `command-${commandId}.json`);
}

export function resultFilePath(queueDir: string, commandId: string): string {
  return path.join(queueDir, `result-${commandId}.json`);
}

export function stateFilePath(queueDir: string): string {
  return path.join(queueDir, "state.json");
}

export function logFilePath(queueDir: string): string {
  return path.join(queueDir, "logs.txt");
}
