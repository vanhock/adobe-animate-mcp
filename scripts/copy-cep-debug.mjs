// Copies hidden src/cep/.debug into build/extension/com.adobe.animatemcp.bridge/.debug (copyfiles skips dotfiles oddly).
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "src", "cep", ".debug");
const destDir = path.join(root, "build", "extension", "com.adobe.animatemcp.bridge");
const dest = path.join(destDir, ".debug");

if (!fs.existsSync(src)) {
  console.error("Missing:", src);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied .debug ->", dest);
