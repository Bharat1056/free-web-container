import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { isProdMode } from "@/lib/app-mode";
import { decryptSecret } from "@/lib/user-secrets";

export type GeminiKeyStatus = {
  required: boolean;
  configured: boolean;
  last4: string | null;
};

export async function getGeminiKeyStatus(
  userId: string,
): Promise<GeminiKeyStatus> {
  const required = isProdMode();
  if (!required) {
    return { required: false, configured: false, last4: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      geminiApiKeyEncrypted: true,
      geminiApiKeyLast4: true,
    },
  });

  const configured = Boolean(user?.geminiApiKeyEncrypted);
  return {
    required: true,
    configured,
    last4: configured ? (user?.geminiApiKeyLast4 ?? null) : null,
  };
}

/**
 * Decrypts the user's Gemini key, or returns null when missing / non-prod.
 */
export async function getUserGeminiApiKey(
  userId: string,
): Promise<string | null> {
  if (!isProdMode()) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiApiKeyEncrypted: true },
  });

  if (!user?.geminiApiKeyEncrypted) {
    return null;
  }

  return decryptSecret(user.geminiApiKeyEncrypted);
}

/**
 * Loads Gemini key for a project's owner (used by Inngest workers).
 */
export async function getProjectOwnerGeminiApiKey(
  projectId: string,
): Promise<string | null> {
  if (!isProdMode()) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });

  if (!project?.userId) {
    return null;
  }

  return getUserGeminiApiKey(project.userId);
}

/**
 * Hard gate for generation mutations when `APP_MODE=prod`.
 */
export async function assertGeminiKeyIfProd(userId: string): Promise<void> {
  if (!isProdMode()) {
    return;
  }

  const key = await getUserGeminiApiKey(userId);
  if (!key) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GEMINI_API_KEY_REQUIRED",
    });
  }
}
