import { RateLimiterPrisma } from "rate-limiter-flexible";
import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

const FREE_USAGE_POINTS = 2;
const PRO_USAGE_POINTS = 100;
const DEFAULT_DURATION = 60 * 60 * 24 * 30;
const GENERATION_USAGE_POINTS = 1;

export async function getUsageTracker() {
  const { has } = await auth();
  const hasProAccess = has({ plan: "pro_user" });
  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: hasProAccess ? PRO_USAGE_POINTS : FREE_USAGE_POINTS,
    duration: DEFAULT_DURATION,
  });
  return usageTracker;  
}

export async function consumeUsage() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("User not authenticated");
  }
  const usageTracker = await getUsageTracker();
  await usageTracker.consume(userId, GENERATION_USAGE_POINTS);
}

export async function getUsageStatus() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("User not authenticated");
  }
  const usageTracker = await getUsageTracker();
  const result = await usageTracker.get(userId);
  return result;
}
