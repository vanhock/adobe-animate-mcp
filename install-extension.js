// Copies the built Adobe Animate CEP extension bundle into user-level extensions (macOS / Windows).

import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const EXTENSION_FOLDER_NAME = "com.adobe.animatemcp.bridge";
const SOURCE_RELATIVE = path.join("build", "extension", EXTENSION_FOLDER_NAME);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";

function getCepExtensionsDir() {
  if (isMac) {
    return path.join(
      process.env.HOME || "",
      "Library",
      "Application Support",
      "Adobe",
      "CEP",
      "extensions"
    );
  }
  if (isWindows) {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error("APPDATA is not set.");
    }
    return path.join(appData, "Adobe", "CEP", "extensions");
  }
  throw new Error("Unsupported platform: install the extension manually from build/extension/" + EXTENSION_FOLDER_NAME);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

const sourceDir = path.join(__dirname, SOURCE_RELATIVE);
const destDir = path.join(getCepExtensionsDir(), EXTENSION_FOLDER_NAME);

if (!fs.existsSync(sourceDir)) {
  console.error(`Source not found: ${sourceDir}`);
  console.error('Run "npm run build" first.');
  process.exit(1);
}

try {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  copyRecursive(sourceDir, destDir);
  console.log(`Installed CEP extension to:\n  ${destDir}`);
  console.log("\nNext steps:");
  console.log("1) Enable CEP debug mode for your CSXS version if the panel does not load (see README).");
  console.log("2) Restart Adobe Animate.");
  console.log("3) Open Window > Extensions > Adobe Animate MCP Bridge.");
} catch (err) {
  console.error("Install failed:", err instanceof Error ? err.message : err);
  console.error("\nYou can copy the folder manually:");
  console.error(`  from: ${sourceDir}`);
  console.error(`  to:   ${destDir}`);
  process.exit(1);
}
