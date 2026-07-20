import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";

import { getSession } from "@/lib/session";

export const createTRPCContext = cache(async () => {
  const session = await getSession();
  return {
    auth: {
      userId: session?.user?.id ?? null,
      session,
    },
  };
});

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => {
    return {
      ...shape,
      cause: error.cause,
    };
  },
});

const isAuthenticated = t.middleware(({ next, ctx }) => {
  if (!ctx.auth.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in required",
    });
  }
  return next({
    ctx: {
      auth: {
        userId: ctx.auth.userId,
        session: ctx.auth.session,
      },
    },
  });
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
