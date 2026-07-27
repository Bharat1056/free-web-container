import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getSandbox } from "@/inngest/utils";

export type SandboxFileMap = { [path: string]: string };

export type FilePartial = {
  path: string;
  content: string;
};

export type ShadcnGroundingTracker = {
  groundedComponents: Set<string>;
};

/** OpenAI function-tool schemas for terminal, createOrUpdateFiles, and readFiles. */
export const OPENAI_CODE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "terminal",
      description:
        "Use the terminal to run commands. For shadcn work prefer: cd /home/user && npx shadcn@latest info --json, search @shadcn -q \"...\", docs <components>, add <components> --yes. For non-shadcn dependencies use npm install <package> --yes.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createOrUpdateFiles",
      description: "Create or update files in the sandbox",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" },
              },
              required: ["path", "content"],
              additionalProperties: false,
            },
          },
        },
        required: ["files"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFiles",
      description: "Read files from the sandbox",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["files"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Runs a shell command inside the E2B sandbox.
 *
 * @param sandboxId - Active sandbox id
 * @param command - Shell command to execute
 * @returns Command stdout, or an error string including stdout/stderr on failure
 */
export async function runTerminal(
  sandboxId: string,
  command: string
): Promise<string> {
  const buffer = { stdout: "", stderr: "" };
  try {
    const sandbox = await getSandbox(sandboxId);
    const result = await sandbox.commands.run(command, {
      onStdout: (data: string) => {
        buffer.stdout += data;
      },
      onStderr: (data: string) => {
        buffer.stderr += data;
      },
    });
    return result.stdout;
  } catch (e) {
    console.error(
      `Command failed: ${e}\nstdout: ${buffer.stdout}\nstderr: ${buffer.stderr}`
    );
    return `Command failed: ${e}\nstdout: ${buffer.stdout}\nstderr: ${buffer.stderr}`;
  }
}

/**
 * Writes one or more files into the sandbox and updates the in-memory file map.
 *
 * @param sandboxId - Active sandbox id
 * @param fileMap - Current path → content checkpoint map
 * @param files - Files to create or overwrite
 * @returns Updated file map plus a short result message (or error text)
 */
export async function createOrUpdateFiles(
  sandboxId: string,
  fileMap: SandboxFileMap,
  files: FilePartial[]
): Promise<{ fileMap: SandboxFileMap; result: string }> {
  try {
    const updateFiles = { ...fileMap };
    const sandbox = await getSandbox(sandboxId);
    for (const file of files) {
      await sandbox.files.write(file.path, file.content);
      updateFiles[file.path] = file.content;
    }
    return {
      fileMap: updateFiles,
      result: `Updated ${files.length} file(s): ${files.map((f) => f.path).join(", ")}`,
    };
  } catch (error) {
    return { fileMap, result: "Error: " + error };
  }
}

/**
 * Reads file contents from the sandbox.
 *
 * Missing or unreadable files are reported per-path via an `error` field instead
 * of throwing, so a hallucinated path (e.g. a component that doesn't exist yet)
 * gives the model actionable feedback rather than failing the whole run.
 *
 * @param sandboxId - Active sandbox id
 * @param paths - Absolute or project-relative paths to read
 * @returns JSON string of `{ path, content }` / `{ path, error }` entries
 */
export async function readFiles(
  sandboxId: string,
  paths: string[]
): Promise<string> {
  const sandbox = await getSandbox(sandboxId);
  const contents: Array<
    { path: string; content: string } | { path: string; error: string }
  > = [];
  for (const file of paths) {
    try {
      const content = await sandbox.files.read(file);
      contents.push({ path: file, content });
    } catch (error) {
      contents.push({
        path: file,
        error: `File does not exist or could not be read: ${
          error instanceof Error ? error.message : String(error)
        }. Do not read it again; create it with createOrUpdateFiles if it is needed.`,
      });
    }
  }
  return JSON.stringify(contents);
}

/**
 * Deterministically writes salvaged partial file content into the sandbox.
 * Used on the rate-limit path — not invoked by the model as a tool.
 *
 * @param sandboxId - Active sandbox id
 * @param fileMap - Current path → content checkpoint map
 * @param partials - Incomplete files recovered from a truncated stream
 * @returns Updated file map after writing the partials
 */
export async function writePartialsToSandbox(
  sandboxId: string,
  fileMap: SandboxFileMap,
  partials: FilePartial[]
): Promise<SandboxFileMap> {
  const { fileMap: updated } = await createOrUpdateFiles(
    sandboxId,
    fileMap,
    partials
  );
  return updated;
}

export type ToolExecutionResult = {
  content: string;
  fileMap: SandboxFileMap;
};

function normalizeShadcnComponentName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@shadcn\//, "")
    .replace(/^components\/ui\//, "")
    .replace(/\.(t|j)sx?$/, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() ?? "";
}

export function extractGroundedShadcnComponentsFromCommand(
  command: string
): string[] {
  const docsOrAddMatch = command.match(
    /npx\s+shadcn@latest\s+(docs|add)\s+([^\n]+)/i
  );
  if (!docsOrAddMatch) return [];

  return docsOrAddMatch[2]
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !part.startsWith("-") &&
        !["&&", "||", ";"].includes(part) &&
        !part.startsWith('"') &&
        !part.startsWith("'")
    )
    .map(normalizeShadcnComponentName)
    .filter(Boolean);
}

export function extractGroundedShadcnComponentsFromReadPaths(
  paths: string[]
): string[] {
  return paths
    .filter((path) => /components\/ui\/.+\.(t|j)sx?$/i.test(path.replace(/\\/g, "/")))
    .map(normalizeShadcnComponentName)
    .filter(Boolean);
}

export function detectImportedShadcnComponents(content: string): string[] {
  return [...content.matchAll(/@\/components\/ui\/([a-z0-9-]+)/gi)]
    .map((match) => normalizeShadcnComponentName(match[1] ?? ""))
    .filter(Boolean);
}

/**
 * Parses a model tool call and dispatches to terminal, createOrUpdateFiles, or readFiles.
 *
 * @param toolName - OpenAI function name from the tool call
 * @param rawArguments - JSON argument string from the model
 * @param sandboxId - Active sandbox id
 * @param fileMap - Current path → content checkpoint map
 * @returns Tool result string for the chat history, plus any updated file map
 */
export async function executeSandboxTool(
  toolName: string,
  rawArguments: string,
  sandboxId: string,
  fileMap: SandboxFileMap,
  tracker?: ShadcnGroundingTracker
): Promise<ToolExecutionResult> {
  let args: unknown;
  try {
    args = JSON.parse(rawArguments);
  } catch {
    return {
      content: `Error: invalid tool arguments JSON for ${toolName}`,
      fileMap,
    };
  }

  if (toolName === "terminal") {
    const command =
      typeof args === "object" &&
      args !== null &&
      "command" in args &&
      typeof (args as { command: unknown }).command === "string"
        ? (args as { command: string }).command
        : "";
    if (!command) {
      return { content: "Error: terminal requires a command string", fileMap };
    }
    for (const component of extractGroundedShadcnComponentsFromCommand(command)) {
      tracker?.groundedComponents.add(component);
    }
    return { content: await runTerminal(sandboxId, command), fileMap };
  }

  if (toolName === "createOrUpdateFiles") {
    const files =
      typeof args === "object" &&
      args !== null &&
      "files" in args &&
      Array.isArray((args as { files: unknown }).files)
        ? ((args as { files: FilePartial[] }).files ?? [])
        : [];
    if (files.length === 0) {
      return {
        content: "Error: createOrUpdateFiles requires a non-empty files array",
        fileMap,
      };
    }
    const { fileMap: updated, result } = await createOrUpdateFiles(
      sandboxId,
      fileMap,
      files
    );
    const importedComponents = files.flatMap((file) =>
      detectImportedShadcnComponents(file.content)
    );
    const missingGrounding = [...new Set(importedComponents)].filter(
      (component) => !tracker?.groundedComponents.has(component)
    );
    const groundingNote =
      missingGrounding.length > 0
        ? `\nGrounding warning: these shadcn imports were written before they were grounded with docs/readFiles/add in this turn: ${missingGrounding.join(
            ", "
          )}. Run shadcn docs/readFiles/add for them before the next edit.`
        : "";
    return { content: result + groundingNote, fileMap: updated };
  }

  if (toolName === "readFiles") {
    const paths =
      typeof args === "object" &&
      args !== null &&
      "files" in args &&
      Array.isArray((args as { files: unknown }).files)
        ? ((args as { files: string[] }).files ?? [])
        : [];
    if (paths.length === 0) {
      return {
        content: "Error: readFiles requires a non-empty files array",
        fileMap,
      };
    }
    for (const component of extractGroundedShadcnComponentsFromReadPaths(paths)) {
      tracker?.groundedComponents.add(component);
    }
    return { content: await readFiles(sandboxId, paths), fileMap };
  }

  return { content: `Error: unknown tool "${toolName}"`, fileMap };
}
