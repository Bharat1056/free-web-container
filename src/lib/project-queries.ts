import type {
  GenerationStatus,
  Message,
  MessageRole,
  MessageType,
  Prisma,
} from "@prisma/client";
import prisma from "@/lib/db";
import {
  errorDetailsAsPrismaJson,
  RETRY_USER_FACING_CONTENT,
  type ErrorDetailsForAnalytics,
} from "@/lib/retry";
import { embedText } from "@/lib/embeddings";

/**
 * Loads the stored E2B sandbox id for a project, if any.
 */
export async function findProjectSandboxId(
  projectId: string,
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { sandboxId: true },
  });
  return project?.sandboxId ?? null;
}

/**
 * Persists the project's durable E2B sandbox id after create/reconnect.
 */
export async function updateProjectSandboxId(
  projectId: string,
  sandboxId: string,
): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { sandboxId },
  });
}

/**
 * Updates the project's current live preview URL.
 */
export async function updateProjectSandboxUrl(
  projectId: string,
  sandboxUrl: string,
): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { sandboxUrl },
  });
}

/**
 * Sets generation status (and clears event id when leaving GENERATING if needed).
 */
export async function markProjectGenerationStatus(
  projectId: string,
  generationStatus: GenerationStatus,
): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { generationStatus },
  });
}

/**
 * Marks the project as GENERATING and stores the Inngest event id.
 */
export async function markProjectGenerating(input: {
  projectId: string;
  inngestEventId: string | null;
}): Promise<void> {
  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      generationStatus: "GENERATING",
      generationStartedAt: new Date(),
      inngestEventId: input.inngestEventId,
    },
  });
}

/**
 * Finds a project owned by the given user, or null.
 */
export async function findProjectByIdForUser(input: {
  projectId: string;
  userId: string;
}) {
  return prisma.project.findUnique({
    where: {
      id: input.projectId,
      userId: input.userId,
    },
  });
}

/**
 * Latest non-disabled fragment file map for agent context / hydrate.
 */
export async function findLatestActiveFragmentFiles(
  projectId: string,
): Promise<{ [path: string]: string }> {
  const fragment = await prisma.fragment.findFirst({
    where: {
      disabled: false,
      message: { projectId },
    },
    orderBy: { createdAt: "desc" },
    select: { files: true },
  });

  if (!fragment?.files || typeof fragment.files !== "object") {
    return {};
  }

  return fragment.files as { [path: string]: string };
}

/**
 * Last USER message that is not type RETRY (the real prompt to re-run).
 */
export async function findLastNonRetryUserMessage(
  projectId: string,
): Promise<Pick<Message, "id" | "content" | "type"> | null> {
  return prisma.message.findFirst({
    where: {
      projectId,
      role: "USER",
      type: { not: "RETRY" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, type: true },
  });
}

/**
 * Disables all fragments for a project (called before creating a new active one).
 */
export async function disablePreviousFragments(
  projectId: string,
): Promise<void> {
  await prisma.fragment.updateMany({
    where: {
      disabled: false,
      message: { projectId },
    },
    data: { disabled: true },
  });
}

type CreateChatMessageInput = {
  content: string;
  role: MessageRole;
  type: MessageType;
  projectId: string;
  embedding?: number[];
  errorDetails?: ErrorDetailsForAnalytics | null;
  fragment?: Prisma.FragmentCreateWithoutMessageInput;
};

/**
 * Persists a chat message. RESULT messages are embedded; RETRY messages are not.
 */
export async function createChatMessage(
  input: CreateChatMessageInput,
): Promise<Message> {
  const shouldEmbed = input.type !== "RETRY";
  let embedding: number[];

  if (input.embedding !== undefined && input.embedding !== null) {
    embedding = input.embedding;
  } else if (shouldEmbed) {
    embedding = await embedText(input.content);
  } else {
    embedding = [];
  }

  return prisma.message.create({
    data: {
      content: input.content,
      role: input.role,
      type: input.type,
      projectId: input.projectId,
      embedding,
      errorDetails:
        input.errorDetails != null
          ? errorDetailsAsPrismaJson(input.errorDetails)
          : undefined,
      ...(input.fragment
        ? {
            fragment: {
              create: input.fragment,
            },
          }
        : {}),
    },
  });
}

/**
 * Saves an ASSISTANT RETRY row with analytics Json (no fragment).
 */
export async function createAssistantRetryMessage(input: {
  projectId: string;
  errorDetails: ErrorDetailsForAnalytics;
  content?: string;
}): Promise<Message> {
  return createChatMessage({
    projectId: input.projectId,
    role: "ASSISTANT",
    type: "RETRY",
    content: input.content ?? RETRY_USER_FACING_CONTENT,
    errorDetails: input.errorDetails,
  });
}

/**
 * After a successful build: disable old fragments, save RESULT + fragment, mark IDLE.
 */
export async function saveSuccessfulGenerationResult(input: {
  projectId: string;
  summary: string;
  files: { [path: string]: string };
  sandboxUrl: string;
  fragmentTitle: string;
}): Promise<Message> {
  await disablePreviousFragments(input.projectId);

  const message = await createChatMessage({
    projectId: input.projectId,
    role: "ASSISTANT",
    type: "RESULT",
    content: input.summary,
    fragment: {
      sandboxUrl: input.sandboxUrl,
      title: input.fragmentTitle,
      files: input.files,
      disabled: false,
    },
  });

  await markProjectGenerationStatus(input.projectId, "IDLE");
  return message;
}
