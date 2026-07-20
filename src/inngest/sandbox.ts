import { Sandbox } from "@e2b/code-interpreter";
import {
  E2B_SANDBOX_TEMPLATE,
  SANDBOX_PREVIEW_PORT,
  SANDBOX_TIMEOUT_MS,
} from "@/types";
import {
  findProjectSandboxId,
  updateProjectSandboxId,
  updateProjectSandboxUrl,
} from "@/lib/project-queries";

export type ProjectSandboxSession = {
  sandboxId: string;
  /** True when a brand-new sandbox was created (needs hydrate if fragment files exist). */
  isSandboxNewlyCreated: boolean;
};

/**
 * Connects to an existing E2B sandbox and refreshes its timeout.
 * Auto-resumes paused sandboxes.
 */
export async function connectProjectSandbox(sandboxId: string): Promise<Sandbox> {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
  return sandbox;
}

/**
 * Creates a new project sandbox with auto-pause on timeout (free-tier friendly).
 */
export async function createProjectSandbox(): Promise<Sandbox> {
  const sandbox = await Sandbox.betaCreate(E2B_SANDBOX_TEMPLATE, {
    timeoutMs: SANDBOX_TIMEOUT_MS,
    autoPause: true,
  });
  return sandbox;
}

/**
 * Reuses the project's stored sandbox when possible; otherwise creates one and
 * persists `Project.sandboxId`.
 */
export async function getOrCreateProjectSandbox(input: {
  projectId: string;
}): Promise<ProjectSandboxSession> {
  const storedSandboxId = await findProjectSandboxId(input.projectId);

  if (storedSandboxId) {
    try {
      await connectProjectSandbox(storedSandboxId);
      return {
        sandboxId: storedSandboxId,
        isSandboxNewlyCreated: false,
      };
    } catch (error) {
      console.warn(
        `Failed to connect sandbox "${storedSandboxId}"; creating a new one:`,
        error,
      );
    }
  }

  const sandbox = await createProjectSandbox();
  await updateProjectSandboxId(input.projectId, sandbox.sandboxId);

  return {
    sandboxId: sandbox.sandboxId,
    isSandboxNewlyCreated: true,
  };
}

/**
 * Builds the public HTTPS preview URL for the sandbox Next.js host.
 */
export async function resolveSandboxPreviewUrl(
  sandboxId: string,
): Promise<string> {
  const sandbox = await connectProjectSandbox(sandboxId);
  const host = sandbox.getHost(SANDBOX_PREVIEW_PORT);
  return `https://${host}`;
}

/**
 * Writes fragment file snapshots into a sandbox (only for newly created VMs).
 */
export async function hydrateSandboxWithFragmentFiles(input: {
  sandboxId: string;
  files: { [path: string]: string };
}): Promise<{ hydratedFileCount: number }> {
  const sandbox = await connectProjectSandbox(input.sandboxId);
  const fileEntries = Object.entries(input.files);

  for (const [path, content] of fileEntries) {
    await sandbox.files.write(path, content);
  }

  return { hydratedFileCount: fileEntries.length };
}

/**
 * Persists the latest live preview URL on the project after success or error.
 */
export async function persistProjectSandboxUrl(input: {
  projectId: string;
  sandboxId: string;
}): Promise<string> {
  const sandboxUrl = await resolveSandboxPreviewUrl(input.sandboxId);
  await updateProjectSandboxUrl(input.projectId, sandboxUrl);
  return sandboxUrl;
}

/** @deprecated Prefer connectProjectSandbox — kept for sandbox-tools callers. */
export async function getSandbox(sandboxId: string) {
  return connectProjectSandbox(sandboxId);
}
