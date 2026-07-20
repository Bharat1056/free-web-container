import { inngest } from "@/inngest/client";
import {
  createChatMessage,
  findLastNonRetryUserMessage,
  findProjectByIdForUser,
  markProjectGenerating,
} from "@/lib/project-queries";
import { isRetryPayload } from "@/lib/retry";
import { consumeUsage } from "@/lib/usage";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";

export const messagesRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      z.object({
        projectId: z
          .string()
          .min(1, { message: "Invalid projectId" })
          .readonly(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const messages = await prisma.message.findMany({
        where: {
          projectId: input.projectId,
          project: {
            userId: ctx.auth.userId,
          },
        },
        include: {
          fragment: true,
        },
        orderBy: {
          updatedAt: "asc",
        },
      });

      return messages;
    }),
  create: protectedProcedure
    .input(
      z.object({
        projectId: z
          .string()
          .min(1, { message: "Invalid projectId" })
          .readonly(),
        value: z
          .string()
          .min(5, { message: "Prompt is required" })
          .max(10000, { message: "Prompt is too long" })
          .optional(),
        retry: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existingProject = await findProjectByIdForUser({
        projectId: input.projectId,
        userId: ctx.auth.userId,
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const shouldRetry = isRetryPayload(input.retry);

      let promptForGeneration: string;

      if (shouldRetry) {
        const lastUserMessage = await findLastNonRetryUserMessage(
          input.projectId,
        );
        if (!lastUserMessage?.content?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No previous user message to retry",
          });
        }
        promptForGeneration = lastUserMessage.content;
      } else {
        if (!input.value?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Prompt is required",
          });
        }
        promptForGeneration = input.value;
      }

      try {
        await consumeUsage();
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "You have run out of credits",
        });
      }

      let createdUserMessage = null;

      if (!shouldRetry) {
        createdUserMessage = await createChatMessage({
          content: promptForGeneration,
          role: "USER",
          type: "RESULT",
          projectId: input.projectId,
        });
      }

      const { ids } = await inngest.send({
        name: "test/create.website",
        data: {
          value: promptForGeneration,
          projectId: input.projectId,
          retry: shouldRetry,
        },
      });

      await markProjectGenerating({
        projectId: input.projectId,
        inngestEventId: ids[0] ?? null,
      });

      return createdUserMessage;
    }),
});
