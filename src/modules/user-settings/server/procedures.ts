import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import prisma from "@/lib/db";
import { isProdMode } from "@/lib/app-mode";
import { getGeminiKeyStatus } from "@/lib/user-gemini-key";
import { encryptSecret, secretLast4 } from "@/lib/user-secrets";

async function pingGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export const userSettingsRouter = createTRPCRouter({
  geminiKey: createTRPCRouter({
    status: protectedProcedure.query(async ({ ctx }) => {
      return getGeminiKeyStatus(ctx.auth.userId);
    }),

    set: protectedProcedure
      .input(
        z.object({
          apiKey: z
            .string()
            .trim()
            .min(20, { message: "API key looks too short" })
            .max(512, { message: "API key is too long" }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!isProdMode()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Gemini BYOK is only available when APP_MODE=prod",
          });
        }

        if (!process.env.ENCRYPTION_KEY?.trim()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ENCRYPTION_KEY is not configured",
          });
        }

        const valid = await pingGeminiKey(input.apiKey);
        if (!valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Gemini API key could not be verified",
          });
        }

        const encrypted = encryptSecret(input.apiKey);
        const last4 = secretLast4(input.apiKey);

        await prisma.user.update({
          where: { id: ctx.auth.userId },
          data: {
            geminiApiKeyEncrypted: encrypted,
            geminiApiKeyLast4: last4,
            geminiApiKeyUpdatedAt: new Date(),
          },
        });

        return {
          configured: true,
          last4,
        };
      }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      if (!isProdMode()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Gemini BYOK is only available when APP_MODE=prod",
        });
      }

      await prisma.user.update({
        where: { id: ctx.auth.userId },
        data: {
          geminiApiKeyEncrypted: null,
          geminiApiKeyLast4: null,
          geminiApiKeyUpdatedAt: null,
        },
      });

      return { configured: false };
    }),
  }),
});
