import { billingRouter } from "@/modules/billing/server/procedures";
import { projectsRouter } from "@/modules/projects/server/procedures";
import { createTRPCRouter } from "../init";
import { messagesRouter } from "@/modules/messages/server/procedures";
import { usageRouter } from "@/modules/usage/server/procedure";
import { userSettingsRouter } from "@/modules/user-settings/server/procedures";

export const appRouter = createTRPCRouter({
  billing: billingRouter,
  messages: messagesRouter,
  projects: projectsRouter,
  usage: usageRouter,
  userSettings: userSettingsRouter,
});

export type AppRouter = typeof appRouter;
