/**
 * Copies web-tree-sitter runtime + TS/TSX grammar WASM into resources/.
 * Runs from postinstall so binaries are not committed to git.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const destDir = path.join(rootDir, "resources", "tree-sitter");

const copies = [
  {
    from: path.join(
      path.dirname(require.resolve("web-tree-sitter/package.json")),
      "tree-sitter.wasm"
    ),
    to: path.join(destDir, "tree-sitter.wasm"),
  },
  {
    from: path.join(
      path.dirname(require.resolve("tree-sitter-wasms/package.json")),
      "out",
      "tree-sitter-typescript.wasm"
    ),
    to: path.join(destDir, "tree-sitter-typescript.wasm"),
  },
  {
    from: path.join(
      path.dirname(require.resolve("tree-sitter-wasms/package.json")),
      "out",
      "tree-sitter-tsx.wasm"
    ),
    to: path.join(destDir, "tree-sitter-tsx.wasm"),
  },
];

fs.mkdirSync(destDir, { recursive: true });

for (const { from, to } of copies) {
  if (!fs.existsSync(from)) {
    throw new Error(`Missing tree-sitter WASM source: ${from}`);
  }
  fs.copyFileSync(from, to);
  console.log(`synced ${path.relative(rootDir, to)}`);
}
