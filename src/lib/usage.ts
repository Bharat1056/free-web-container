import { RateLimiterPrisma } from "rate-limiter-flexible";

import { getUserPlan } from "@/lib/billing";
import prisma from "@/lib/db";
import { getSession } from "@/lib/session";

const FREE_USAGE_POINTS = 2;
const PRO_USAGE_POINTS = 100;
const DEFAULT_DURATION = 60 * 60 * 24 * 30;
const GENERATION_USAGE_POINTS = 1;

async function requireUserId() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("User not authenticated");
  }
  return userId;
}

export async function getUsageTracker(userId: string) {
  const { isPro } = await getUserPlan(userId);
  return new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: isPro ? PRO_USAGE_POINTS : FREE_USAGE_POINTS,
    duration: DEFAULT_DURATION,
  });
}

export async function consumeUsage() {
  const userId = await requireUserId();
  const usageTracker = await getUsageTracker(userId);
  await usageTracker.consume(userId, GENERATION_USAGE_POINTS);
}

export async function getUsageStatus() {
  const userId = await requireUserId();
  const usageTracker = await getUsageTracker(userId);
  return usageTracker.get(userId);
}
