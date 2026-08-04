import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { runWithGeminiKey } from "@/lib/gemini-key-context";
import { reconcileProjectGenerationStatus } from "@/inngest/run-status";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeUsage } from "@/lib/usage";
import { validatePrompt } from "@/modules/validation/server/validate-prompt";
import {
  assertGeminiKeyIfProd,
  getUserGeminiApiKey,
} from "@/lib/user-gemini-key";

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1, { message: "Invalid projectId" }).readonly(),
      })
    )
    .query(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return reconcileProjectGenerationStatus(existingProject);
    }),
  getMany: protectedProcedure.query(async ({ ctx }) => {
    const projects = await prisma.project.findMany({
      where: {
        userId: ctx.auth.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return projects;
  }),
  create: protectedProcedure
    .input(
      z.object({
        value: z
          .string()
          .min(5, { message: "Prompt is required" })
          .max(10000, { message: "Prompt is too long" })
          .readonly(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertGeminiKeyIfProd(ctx.auth.userId);
      const geminiApiKey = await getUserGeminiApiKey(ctx.auth.userId);

      return runWithGeminiKey(geminiApiKey ?? undefined, async () => {
        try {
          await consumeUsage();
        } catch (error) {
          if (error instanceof Error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
            });
          } else {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "You have run out of credits",
            });
          }
        }

        const validation = await validatePrompt(input.value);
        if (!validation.isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "BAD_PROMPT",
          });
        }

        const embedding = await embedText(input.value);

        const createdProject = await prisma.project.create({
          data: {
            userId: ctx.auth.userId,
            name: generateSlug(2, {
              format: "kebab",
            }),
            generationStatus: "GENERATING",
            generationStartedAt: new Date(),
            messages: {
              create: {
                content: input.value,
                role: "USER",
                type: "RESULT",
                embedding,
              },
            },
          },
        });

        const { ids } = await inngest.send({
          name: "test/create.website",
          data: {
            value: input.value,
            projectId: createdProject.id,
            retry: false,
          },
        });

        return prisma.project.update({
          where: { id: createdProject.id },
          data: {
            inngestEventId: ids[0] ?? null,
          },
        });
      });
    }),
});
