import type { Plan, User } from "@prisma/client";

import prisma from "@/lib/db";

export {
  PRO_AMOUNT,
  PRO_CURRENCY,
  PRO_DURATION_DAYS,
  PRO_PRICE_LABEL,
} from "@/lib/billing-constants";

export function isProPlan(
  user: Pick<User, "plan" | "planExpiresAt"> | null | undefined
): boolean {
  if (!user || user.plan !== "PRO") return false;
  if (!user.planExpiresAt) return true;
  return user.planExpiresAt.getTime() > Date.now();
}

export async function getUserPlan(userId: string): Promise<{
  plan: Plan;
  planExpiresAt: Date | null;
  isPro: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true },
  });

  if (!user) {
    return { plan: "FREE", planExpiresAt: null, isPro: false };
  }

  const isPro = isProPlan(user);

  if (user.plan === "PRO" && !isPro) {
    return { plan: "FREE", planExpiresAt: user.planExpiresAt, isPro: false };
  }

  return {
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
    isPro,
  };
}

export async function grantProAccess(params: {
  userId: string;
  durationDays: number | null;
  couponCode?: string | null;
}) {
  const { userId, durationDays, couponCode } = params;
  const planExpiresAt =
    durationDays == null
      ? null
      : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  return prisma.user.update({
    where: { id: userId },
    data: {
      plan: "PRO",
      planExpiresAt,
      ...(couponCode !== undefined ? { couponCode } : {}),
    },
  });
}
