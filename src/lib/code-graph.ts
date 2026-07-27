import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type madge from "madge";
import { CODE_EDGE_KIND_IMPORTS } from "@/constants";
import {
  normalizeProjectPath,
  resolveTempFilePath,
  shouldSkipCodePath,
} from "@/lib/code-utils";

/** One directed import link between project files. */
export type CodeImportEdge = {
  fromPath: string;
  toPath: string;
  kind: typeof CODE_EDGE_KIND_IMPORTS;
};

/** Madge's default export: build a dependency graph from a path. */
type MadgeFactory = typeof madge;

/**
 * Dynamically loads madge so Next does not statically bundle it.
 *
 * Prefer this over a top-level `import "madge"` when the module is listed in
 * `serverExternalPackages`. Return type matches madge's real signature:
 * `(path: MadgePath, config?: MadgeConfig) => Promise<MadgeInstance>`.
 *
 * @returns The madge default export function
 *
 * @example
 * ```ts
 * const madge = await loadMadgeModule();
 * const graph = await madge(tempRoot, options);
 * ```
 */
async function loadMadgeModule(): Promise<MadgeFactory> {
  const madgeModule = await import("madge");
  return (madgeModule.default ?? madgeModule) as MadgeFactory;
}

/**
 * Writes a fragment file map into a temporary directory for madge.
 *
 * Madge expects real files on disk. Always pair a successful return with
 * {@link removeTempProjectDirectory} in a `finally` block. If writing fails
 * mid-way, this helper removes the temp root before rethrowing so callers
 * never leak a partial directory.
 *
 * @param files - Project `path → content` map
 * @returns Absolute path of the created temp root
 *
 * @example
 * ```ts
 * const tempRoot = await writeFilesToTempDirectory(files);
 * try {
 *   // run madge(tempRoot)
 * } finally {
 *   await removeTempProjectDirectory(tempRoot);
 * }
 * ```
 */
export async function writeFilesToTempDirectory(files: {
  [path: string]: string;
}): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "emergent-code-"));

  try {
    for (const [filePath, content] of Object.entries(files)) {
      const normalized = normalizeProjectPath(filePath);
      if (shouldSkipCodePath(normalized)) {
        continue;
      }

      const absolutePath = resolveTempFilePath(tempRoot, normalized);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(
        absolutePath,
        typeof content === "string" ? content : String(content ?? ""),
        "utf8"
      );
    }

    return tempRoot;
  } catch (error) {
    await removeTempProjectDirectory(tempRoot);
    throw error;
  }
}

/**
 * Deletes a temporary project directory created for madge.
 *
 * Safe to call with an empty string; errors are logged and swallowed so
 * indexing can still finish after a successful graph build.
 *
 * @param tempRootAbsolute - Absolute temp root from {@link writeFilesToTempDirectory}
 *
 * @example
 * ```ts
 * await removeTempProjectDirectory(tempRoot);
 * ```
 */
export async function removeTempProjectDirectory(
  tempRootAbsolute: string
): Promise<void> {
  if (!tempRootAbsolute) {
    return;
  }
  try {
    await fs.rm(tempRootAbsolute, { recursive: true, force: true });
  } catch (error) {
    console.warn("Failed to remove madge temp directory:", error);
  }
}

const TSCONFIG_CANDIDATES = [
  "tsconfig.json",
  "tsconfig.app.json",
  "jsconfig.json",
] as const;

/**
 * Picks the `@/*` path mapping target for a fragment file map.
 *
 * Sandbox Next apps usually map `@/*` → `./*`. Fragments that live under
 * `src/` use `@/*` → `./src/*` instead.
 *
 * @param files - Project `path → content` map
 * @returns Path pattern array for `compilerOptions.paths["@/*"]`
 *
 * @example
 * ```ts
 * inferAtAliasPathPatterns({ "app/page.tsx": "..." }); // ["./*"]
 * inferAtAliasPathPatterns({ "src/app/page.tsx": "..." }); // ["./src/*"]
 * ```
 */
export function inferAtAliasPathPatterns(files: {
  [path: string]: string;
}): string[] {
  const usesSrcLayout = Object.keys(files).some((filePath) =>
    normalizeProjectPath(filePath).startsWith("src/")
  );
  return usesSrcLayout ? ["./src/*"] : ["./*"];
}

/**
 * Returns an existing tsconfig/jsconfig path under the temp root, if present.
 */
async function findExistingTsConfigPath(
  tempRootAbsolute: string,
  files: { [path: string]: string }
): Promise<string | null> {
  for (const candidate of TSCONFIG_CANDIDATES) {
    const inFragment = Object.keys(files).some(
      (filePath) => normalizeProjectPath(filePath) === candidate
    );
    if (!inFragment) {
      continue;
    }
    const absolutePath = path.join(tempRootAbsolute, candidate);
    try {
      await fs.access(absolutePath);
      return absolutePath;
    } catch {
      // Fall through to generated config.
    }
  }
  return null;
}

/**
 * Ensures madge can resolve `@/*` aliases for a materialized temp project.
 *
 * Prefers a fragment-provided tsconfig when present; otherwise writes a
 * minimal `tsconfig.json` (and matching `webpack.config.js` for JS/JSX).
 *
 * @param tempRootAbsolute - Temp root from {@link writeFilesToTempDirectory}
 * @param files - Original fragment file map (used to infer alias layout)
 * @returns Absolute paths for madge `tsConfig` / `webpackConfig`
 */
export async function ensureMadgeAliasConfig(
  tempRootAbsolute: string,
  files: { [path: string]: string }
): Promise<{ tsConfig: string; webpackConfig: string }> {
  const aliasPatterns = inferAtAliasPathPatterns(files);
  const aliasRoot = aliasPatterns[0] === "./src/*" ? "src" : ".";

  let tsConfig = await findExistingTsConfigPath(tempRootAbsolute, files);
  if (!tsConfig) {
    tsConfig = path.join(tempRootAbsolute, "tsconfig.json");
    await fs.writeFile(
      tsConfig,
      `${JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@/*": aliasPatterns,
            },
            jsx: "preserve",
            module: "esnext",
            moduleResolution: "bundler",
            allowJs: true,
            strict: false,
            skipLibCheck: true,
          },
          include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  const webpackConfig = path.join(tempRootAbsolute, "webpack.config.js");
  await fs.writeFile(
    webpackConfig,
    `const path = require("path");\nmodule.exports = {\n  resolve: {\n    alias: {\n      "@": path.resolve(__dirname, ${JSON.stringify(aliasRoot)}),\n    },\n    extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],\n  },\n};\n`,
    "utf8"
  );

  return { tsConfig, webpackConfig };
}

/**
 * Converts madge's dependency object into normalized project-relative edges.
 *
 * Only keeps edges whose `toPath` exists in `knownPaths` so unresolved npm
 * packages and missing files never enter `CodeEdge`.
 *
 * @param dependencyMap - Result of `madge(...).obj()`
 * @param knownPaths - Set of normalized paths present in the fragment
 * @returns Deduped import edges sorted by fromPath then toPath
 *
 * @example
 * ```ts
 * buildImportEdgesFromMadgeObject(
 *   { "src/a.tsx": ["src/b.tsx"] },
 *   new Set(["src/a.tsx", "src/b.tsx"])
 * );
 * ```
 */
export function buildImportEdgesFromMadgeObject(
  dependencyMap: Record<string, string[]>,
  knownPaths: Set<string>
): CodeImportEdge[] {
  const edgeKeySet = new Set<string>();
  const edges: CodeImportEdge[] = [];

  const entries = Object.entries(dependencyMap).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  for (const [fromRaw, dependents] of entries) {
    const fromPath = normalizeProjectPath(fromRaw);
    if (!knownPaths.has(fromPath)) {
      continue;
    }

    const sortedDependents = [...(dependents ?? [])]
      .map(normalizeProjectPath)
      .sort();

    for (const toPath of sortedDependents) {
      if (!knownPaths.has(toPath) || toPath === fromPath) {
        continue;
      }
      const edgeKey = `${fromPath}=>${toPath}`;
      if (edgeKeySet.has(edgeKey)) {
        continue;
      }
      edgeKeySet.add(edgeKey);
      edges.push({
        fromPath,
        toPath,
        kind: CODE_EDGE_KIND_IMPORTS,
      });
    }
  }

  return edges.sort((left, right) => {
    if (left.fromPath !== right.fromPath) {
      return left.fromPath.localeCompare(right.fromPath);
    }
    return left.toPath.localeCompare(right.toPath);
  });
}

/**
 * Builds the project's import graph with madge from an in-memory file map.
 *
 * Materializes files to a temp directory, runs madge, then cleans up.
 * Returns an empty list when madge fails so indexing can still store chunks.
 *
 * @param files - Latest fragment file map
 * @returns Normalized `IMPORTS` edges for Postgres `CodeEdge`
 *
 * @example
 * ```ts
 * const edges = await buildProjectImportEdgesWithMadge(files);
 * ```
 */
export async function buildProjectImportEdgesWithMadge(files: {
  [path: string]: string;
}): Promise<CodeImportEdge[]> {
  const knownPaths = new Set(
    Object.keys(files)
      .map(normalizeProjectPath)
      .filter((filePath) => !shouldSkipCodePath(filePath))
  );

  if (knownPaths.size === 0) {
    return [];
  }

  let tempRoot = "";
  try {
    tempRoot = await writeFilesToTempDirectory(files);
    const { tsConfig, webpackConfig } = await ensureMadgeAliasConfig(
      tempRoot,
      files
    );
    const madge = await loadMadgeModule();
    const graph = await madge(tempRoot, {
      includeNpm: false,
      fileExtensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"],
      baseDir: tempRoot,
      tsConfig,
      webpackConfig,
    });
    const dependencyMap = graph.obj() as Record<string, string[]>;
    const edges = buildImportEdgesFromMadgeObject(dependencyMap, knownPaths);
    if (edges.length === 0) {
      console.warn(
        `madge returned 0 import edges for ${knownPaths.size} indexed file(s); alias resolution or empty dependency graph may be truncating expansion`
      );
    }
    return edges;
  } catch (error) {
    console.error("madge import graph failed:", error);
    return [];
  } finally {
    await removeTempProjectDirectory(tempRoot);
  }
}
