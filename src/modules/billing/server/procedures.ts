import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  PRO_AMOUNT,
  PRO_CURRENCY,
  PRO_DURATION_DAYS,
  PRO_PRICE_LABEL,
  getUserPlan,
} from "@/lib/billing";
import prisma from "@/lib/db";
import {
  createProOrder,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from "@/lib/razorpay";
import { createTRPCRouter, protectedProcedure, baseProcedure } from "@/trpc/init";

export const billingRouter = createTRPCRouter({
  config: baseProcedure.query(() => {
    return {
      priceLabel: PRO_PRICE_LABEL,
      amount: PRO_AMOUNT,
      currency: PRO_CURRENCY,
      durationDays: PRO_DURATION_DAYS,
      razorpayEnabled: isRazorpayConfigured(),
      keyId: isRazorpayConfigured() ? process.env.RAZORPAY_KEY_ID : null,
    };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        plan: true,
        planExpiresAt: true,
        couponCode: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const plan = await getUserPlan(user.id);
    return { ...user, ...plan };
  }),

  createCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isRazorpayConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Billing is not configured yet",
      });
    }

    const plan = await getUserPlan(ctx.auth.userId);
    if (plan.isPro) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You already have Pro access",
      });
    }

    const receipt = `pro_${ctx.auth.userId.slice(0, 8)}_${Date.now()}`;
    const order = await createProOrder(receipt);

    await prisma.payment.create({
      data: {
        userId: ctx.auth.userId,
        razorpayOrderId: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        status: "CREATED",
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.userId },
      select: { name: true, email: true },
    });

    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      name: "Vibe Pro",
      description: `Pro plan — ${PRO_PRICE_LABEL}`,
      prefill: {
        name: user?.name ?? undefined,
        email: user?.email ?? undefined,
      },
    };
  }),

  verifyPayment: protectedProcedure
    .input(
      z.object({
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        razorpaySignature: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const payment = await prisma.payment.findUnique({
        where: { razorpayOrderId: input.razorpayOrderId },
      });

      if (!payment || payment.userId !== ctx.auth.userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment order not found",
        });
      }

      if (payment.status === "PAID") {
        return { ok: true as const, alreadyProcessed: true };
      }

      const valid = verifyPaymentSignature({
        orderId: input.razorpayOrderId,
        paymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
      });

      if (!valid) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid payment signature",
        });
      }

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "PAID",
            razorpayPaymentId: input.razorpayPaymentId,
          },
        }),
        prisma.user.update({
          where: { id: ctx.auth.userId },
          data: {
            plan: "PRO",
            planExpiresAt: new Date(
              Date.now() + PRO_DURATION_DAYS * 24 * 60 * 60 * 1000
            ),
          },
        }),
      ]);

      return { ok: true as const, alreadyProcessed: false };
    }),

  applyCoupon: protectedProcedure
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .min(1, "Coupon code is required")
          .max(64)
          .transform((value) => value.toUpperCase()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await getUserPlan(ctx.auth.userId);
      if (plan.isPro) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have Pro access",
        });
      }

      const coupon = await prisma.coupon.findUnique({
        where: { code: input.code },
      });

      if (!coupon || !coupon.isActive) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid coupon code",
        });
      }

      if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This coupon has expired",
        });
      }

      if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This coupon has reached its usage limit",
        });
      }

      await prisma.$transaction(async (tx) => {
        const updated = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            isActive: true,
            ...(coupon.maxUses != null
              ? { usedCount: { lt: coupon.maxUses } }
              : {}),
          },
          data: { usedCount: { increment: 1 } },
        });

        if (updated.count === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This coupon has reached its usage limit",
          });
        }

        const planExpiresAt =
          coupon.durationDays == null
            ? null
            : new Date(
                Date.now() + coupon.durationDays * 24 * 60 * 60 * 1000
              );

        await tx.user.update({
          where: { id: ctx.auth.userId },
          data: {
            plan: "PRO",
            planExpiresAt,
            couponCode: coupon.code,
          },
        });
      });

      return {
        ok: true as const,
        durationDays: coupon.durationDays,
      };
    }),
});
