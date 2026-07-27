import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chunkFileByLineWindows,
  chunkProjectFile,
} from "@/lib/code-chunker";
import { buildImportEdgesFromMadgeObject } from "@/lib/code-graph";
import {
  buildCodeChunkContentHash,
  normalizeProjectPath,
  shouldSkipCodePath,
  tokenizePromptForCodeSearch,
} from "@/lib/code-utils";
import {
  compareRankedChunksStable,
  computeHybridCodeScore,
  scorePathAgainstPrompt,
} from "@/lib/code-retrieve";
import { CODE_EXACT_PATH_PIN_SCORE } from "@/constants";

describe("code-utils", () => {
  it("normalizes windows paths", () => {
    assert.equal(normalizeProjectPath(".\\src\\app.tsx"), "src/app.tsx");
  });

  it("skips node_modules and lockfiles", () => {
    assert.equal(shouldSkipCodePath("node_modules/lodash/index.js"), true);
    assert.equal(shouldSkipCodePath("package-lock.json"), true);
    assert.equal(shouldSkipCodePath("src/app/page.tsx"), false);
  });

  it("tokenizes prompts without stopwords", () => {
    assert.deepEqual(tokenizePromptForCodeSearch("please make the navbar dark"), [
      "navbar",
      "dark",
    ]);
  });

  it("builds stable content hashes", () => {
    const left = buildCodeChunkContentHash({
      path: "a.ts",
      startLine: 1,
      endLine: 2,
      content: "const x = 1;",
    });
    const right = buildCodeChunkContentHash({
      path: "a.ts",
      startLine: 1,
      endLine: 2,
      content: "const x = 1;",
    });
    assert.equal(left, right);
  });
});

describe("code-chunker", () => {
  it("produces identical line-window chunks for the same input", () => {
    const source = Array.from({ length: 100 }, (_, i) => `line-${i + 1}`).join(
      "\n"
    );
    const first = chunkFileByLineWindows("readme.md", source);
    const second = chunkFileByLineWindows("readme.md", source);
    assert.deepEqual(first, second);
    assert.ok(first.length > 1);
  });

  it("chunks a typescript file without throwing", async () => {
    const source = `
export function greet(name: string) {
  return "hello " + name;
}

export function add(a: number, b: number) {
  return a + b;
}
`;
    const chunks = await chunkProjectFile("src/math.ts", source);
    assert.ok(chunks.length >= 1);
    assert.equal(chunks[0]?.path, "src/math.ts");
    assert.ok(chunks[0]?.contentHash);
  });
});

describe("code-graph", () => {
  it("keeps only known project paths from madge output", () => {
    const edges = buildImportEdgesFromMadgeObject(
      {
        "src/a.tsx": ["src/b.tsx", "lodash"],
        "src/b.tsx": [],
      },
      new Set(["src/a.tsx", "src/b.tsx"])
    );
    assert.deepEqual(edges, [
      {
        fromPath: "src/a.tsx",
        toPath: "src/b.tsx",
        kind: "IMPORTS",
      },
    ]);
  });
});

describe("code-retrieve scoring", () => {
  it("pins basename matches above hybrid noise", () => {
    const pinned = scorePathAgainstPrompt(
      "src/components/navbar.tsx",
      "fix navbar.tsx color",
      ["navbar", "tsx", "color"]
    );
    assert.equal(pinned.isPinned, true);
    const score = computeHybridCodeScore(pinned.keywordScore, 0.1, pinned.isPinned);
    assert.ok(score >= CODE_EXACT_PATH_PIN_SCORE || score >= 0.85);
  });

  it("sorts ties by path then startLine", () => {
    const ranked = [
      { score: 0.5, path: "b.ts", startLine: 2 },
      { score: 0.5, path: "a.ts", startLine: 9 },
      { score: 0.5, path: "a.ts", startLine: 1 },
      { score: 0.9, path: "z.ts", startLine: 1 },
    ].sort(compareRankedChunksStable);

    assert.deepEqual(
      ranked.map((item) => `${item.score}:${item.path}:${item.startLine}`),
      ["0.9:z.ts:1", "0.5:a.ts:1", "0.5:a.ts:9", "0.5:b.ts:2"]
    );
  });
});
