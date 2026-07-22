import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "./client";
import { sanitizeFragmentTitle } from "@/inngest/utils";
import {
  getOrCreateProjectSandbox,
  hydrateSandboxWithFragmentFiles,
  persistProjectSandboxUrl,
} from "@/inngest/sandbox";
import { isRateLimitError, throwIfRateLimited } from "@/inngest/rate-limit";
import { runCodeToolLoop } from "@/inngest/code-tool-loop";
import { getRelevantMessages } from "@/lib/message-context";
import { reindexProjectFiles } from "@/lib/code-index";
import { retrieveCodeContext } from "@/lib/code-retrieve";
import { getModelChain, CODE_REINDEX_MAX_RETRIES } from "@/constants";
import { isRetryPayload, toErrorDetails } from "@/lib/retry";
import {
  createAssistantRetryMessage,
  findLatestActiveFragmentFiles,
  findProjectSandboxId,
  markProjectGenerationStatus,
  saveSuccessfulGenerationResult,
} from "@/lib/project-queries";

const CREATE_WEBSITE_FUNCTION_ID = "create-website";

type AgentRunState = {
  sandboxId: string;
  isSandboxNewlyCreated: boolean;
  isRetry: boolean;
  freshMode: boolean;
  editMode: boolean;
  isContinuation: boolean;
  userPrompt: string;
  previousMessages: Array<{
    type?: string;
    role?: string;
    content?: unknown;
  }>;
  files: { [path: string]: string };
  summary: string;
  sandboxUrl: string;
};

function createInitialAgentRunState(input: {
  sandboxId: string;
  isSandboxNewlyCreated: boolean;
  isRetry: boolean;
  userPrompt: string;
}): AgentRunState {
  return {
    sandboxId: input.sandboxId,
    isSandboxNewlyCreated: input.isSandboxNewlyCreated,
    isRetry: input.isRetry,
    freshMode: false,
    editMode: false,
    isContinuation: false,
    userPrompt: input.userPrompt,
    previousMessages: [],
    files: {},
    summary: "",
    sandboxUrl: "",
  };
}

/**
 * Derives fresh / edit / continuation flags from retry + whether files exist.
 */
function deriveRunModes(input: {
  hasExistingFiles: boolean;
  isRetry: boolean;
}): Pick<AgentRunState, "freshMode" | "editMode" | "isContinuation"> {
  const hasExistingFiles = input.hasExistingFiles;
  const isRetry = input.isRetry;

  if (!hasExistingFiles && !isRetry) {
    return { freshMode: true, editMode: false, isContinuation: false };
  }

  if (hasExistingFiles && isRetry) {
    return { freshMode: false, editMode: false, isContinuation: true };
  }

  if (hasExistingFiles && !isRetry) {
    return { freshMode: false, editMode: true, isContinuation: false };
  }

  // No files + retry (first-run failure): fresh-like context, prompt already set.
  return { freshMode: true, editMode: false, isContinuation: false };
}

function extractOriginalProjectId(eventData: unknown): string | null {
  if (!eventData || typeof eventData !== "object") return null;
  const data = eventData as {
    event?: { data?: { projectId?: string } };
    function_id?: string;
  };
  const projectId = data.event?.data?.projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
}

function isCreateWebsiteFailure(eventData: unknown): boolean {
  if (!eventData || typeof eventData !== "object") return false;
  const functionId = (eventData as { function_id?: string }).function_id;
  return (
    typeof functionId === "string" &&
    functionId.includes(CREATE_WEBSITE_FUNCTION_ID)
  );
}

export const codeAgentFunction = inngest.createFunction(
  {
    id: CREATE_WEBSITE_FUNCTION_ID,
    retries: 5,
  },
  { event: "test/create.website" },
  async ({ event, step }) => {
    const projectId = event.data.projectId as string;
    const isRetry = isRetryPayload(event.data.retry);
    const userPrompt = String(event.data.value ?? "");

    try {
      const sandboxSession = await step.run("get-or-create-sandbox", async () =>
        getOrCreateProjectSandbox({ projectId }),
      );

      let agentState = createInitialAgentRunState({
        sandboxId: sandboxSession.sandboxId,
        isSandboxNewlyCreated: sandboxSession.isSandboxNewlyCreated,
        isRetry,
        userPrompt,
      });

      const existingFiles = await step.run("load-existing-files", async () =>
        findLatestActiveFragmentFiles(projectId),
      );

      const hasExistingFiles = Object.keys(existingFiles).length > 0;
      const modes = deriveRunModes({ hasExistingFiles, isRetry });
      agentState = { ...agentState, ...modes };

      if (agentState.freshMode) {
        agentState = {
          ...agentState,
          previousMessages: [],
          files: {},
        };
      } else {
        const previousMessages = await step.run(
          "get-previous-messages",
          async () => getRelevantMessages(projectId, agentState.userPrompt),
        );

        agentState = {
          ...agentState,
          previousMessages:
            previousMessages as AgentRunState["previousMessages"],
          files: existingFiles,
        };
      }

      if (
        agentState.isSandboxNewlyCreated &&
        Object.keys(agentState.files).length > 0
      ) {
        await step.run("hydrate-sandbox", async () =>
          hydrateSandboxWithFragmentFiles({
            sandboxId: agentState.sandboxId,
            files: agentState.files,
          }),
        );
      }

      const codeContext =
        Object.keys(agentState.files).length > 0
          ? await step.run("retrieve-code-context", async () =>
              retrieveCodeContext(
                projectId,
                agentState.userPrompt,
                agentState.files,
              ),
            )
          : undefined;

      const codeModelIds = getModelChain("code");
      let codeResult;
      try {
        codeResult = await runCodeToolLoop({
          step,
          sandboxId: agentState.sandboxId,
          files: agentState.files,
          historyMessages: agentState.previousMessages,
          userPrompt: agentState.userPrompt,
          enhancedPrompt: undefined,
          modelIds: codeModelIds,
          codeContext,
        });
      } catch (error) {
        throwIfRateLimited(error);
        throw error;
      }

      agentState = {
        ...agentState,
        summary: codeResult.summary,
        files: codeResult.files,
      };

      const isEmptyCodeResult =
        !codeResult.summary || Object.keys(codeResult.files || {}).length === 0;

      const sandboxUrl = await step.run("persist-sandbox-url", async () =>
        persistProjectSandboxUrl({
          projectId,
          sandboxId: agentState.sandboxId,
        }),
      );
      agentState = { ...agentState, sandboxUrl };

      await step.run("save-result", async () => {
        if (isEmptyCodeResult) {
          await markProjectGenerationStatus(projectId, "FAILED");
          return createAssistantRetryMessage({
            projectId,
            errorDetails: toErrorDetails("Empty code result", {
              code: "EMPTY_CODE_RESULT",
              step: "save-result",
            }),
          });
        }

        return saveSuccessfulGenerationResult({
          projectId,
          summary: codeResult.summary,
          files: codeResult.files,
          sandboxUrl,
          fragmentTitle: sanitizeFragmentTitle(codeResult.summary),
        });
      });

      if (!isEmptyCodeResult) {
        await step.run("reindex-code", async () => {
          const maxAttempts = 1 + CODE_REINDEX_MAX_RETRIES;
          let lastError: unknown;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              return await reindexProjectFiles(projectId, codeResult.files);
            } catch (error) {
              lastError = error;
              console.error(
                `Code reindex failed (attempt ${attempt}/${maxAttempts}):`,
                error,
              );
              if (attempt >= maxAttempts) {
                break;
              }
            }
          }

          // Fragment is already saved; index can be rebuilt on the next success.
          return {
            chunkCount: 0,
            embeddedCount: 0,
            reusedCount: 0,
            edgeCount: 0,
            error:
              lastError instanceof Error
                ? lastError.message
                : String(lastError),
            attempts: maxAttempts,
          };
        });
      }

      return {
        url: sandboxUrl,
        title: sanitizeFragmentTitle(codeResult.summary),
        files: codeResult.files,
        summary: codeResult.summary,
      };
    } catch (error) {
      if (error instanceof NonRetriableError) {
        throw error;
      }
      if (error instanceof RetryAfterError || isRateLimitError(error)) {
        throwIfRateLimited(error);
        throw error;
      }

      console.error("Complete function failure:", error);

      await step.run("save-error-message", async () => {
        const storedSandboxId = await findProjectSandboxId(projectId);

        if (storedSandboxId) {
          try {
            await persistProjectSandboxUrl({
              projectId,
              sandboxId: storedSandboxId,
            });
          } catch (urlError) {
            console.warn(
              "Could not persist sandbox URL after failure:",
              urlError,
            );
          }
        }

        await markProjectGenerationStatus(projectId, "FAILED");
        return createAssistantRetryMessage({
          projectId,
          errorDetails: toErrorDetails(error, { step: "save-error-message" }),
        });
      });

      throw error;
    }
  },
);

/**
 * When create-website exhausts retries, mark the project FAILED so the UI
 * shows Retry (composer locked).
 */
export const handleGenerationFailed = inngest.createFunction(
  { id: "generation-failed" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    if (!isCreateWebsiteFailure(event.data)) return;

    const projectId = extractOriginalProjectId(event.data);
    if (!projectId) return;

    await step.run("mark-failed", async () => {
      await markProjectGenerationStatus(projectId, "FAILED");
    });
  },
);

/**
 * When create-website is cancelled, mark CANCELLED. FE maps this to the same
 * Retry button + retry:true path as FAILED.
 */
export const handleGenerationCancelled = inngest.createFunction(
  { id: "generation-cancelled" },
  { event: "inngest/function.cancelled" },
  async ({ event, step }) => {
    if (!isCreateWebsiteFailure(event.data)) return;

    const projectId = extractOriginalProjectId(event.data);
    if (!projectId) return;

    await step.run("mark-cancelled", async () => {
      await markProjectGenerationStatus(projectId, "CANCELLED");
    });
  },
);
