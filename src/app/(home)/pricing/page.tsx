"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, TicketIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRO_PRICE_LABEL } from "@/lib/billing-constants";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const freeFeatures = [
  { text: "Daily free credits", bold: "free credits" },
  { text: "Chat-to-build workspace" },
  { text: "Live sandbox preview" },
  { text: "Browse generated files" },
  { text: "Automatic background generation" },
];

const proFeatures = [
  { text: "Higher credit limits", bold: "Higher" },
  { text: "Priority generation" },
  { text: "Everything in Free" },
  { text: "Cancel anytime, no lock-in" },
];

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function FeatureItem({ text, bold }: { text: string; bold?: string }) {
  const content =
    bold && text.includes(bold) ? (
      <>
        {text.slice(0, text.indexOf(bold))}
        <strong className="font-semibold">{bold}</strong>
        {text.slice(text.indexOf(bold) + bold.length)}
      </>
    ) : (
      text
    );

  return (
    <li className="flex items-start gap-2.5 text-sm leading-snug">
      <CheckIcon
        className="mt-0.5 size-4 shrink-0 text-primary"
        strokeWidth={3}
      />
      <span>{content}</span>
    </li>
  );
}

const Page = () => {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const signedIn = Boolean(session?.user);

  const [coupon, setCoupon] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);

  const { data: config } = useQuery(trpc.billing.config.queryOptions());
  const { data: billing } = useQuery({
    ...trpc.billing.me.queryOptions(),
    enabled: signedIn, // only fetch billing data if the user is signed in
    // in useQuery, enabled is used to control whether the query should be executed
  });

  const priceLabel = config?.priceLabel ?? PRO_PRICE_LABEL;
  const isPro = billing?.isPro ?? false;

  const applyCoupon = useMutation({
    ...trpc.billing.applyCoupon.mutationOptions(),
    onSuccess: async () => {
      toast.success("Coupon applied — you're on Pro!");
      setCoupon("");
      // after successful coupon application, invalidate the billing and usage queries to fetch the updated data
      await queryClient.invalidateQueries(trpc.billing.me.queryOptions());
      await queryClient.invalidateQueries(trpc.usage.status.queryOptions());
    },
    onError: (error) => {
      toast.error(error.message || "Could not apply coupon");
    },
  });

  const createCheckout = useMutation({
    ...trpc.billing.createCheckout.mutationOptions(),
  });

  const verifyPayment = useMutation({
    ...trpc.billing.verifyPayment.mutationOptions(),
    onSuccess: async () => {
      toast.success("Payment successful — welcome to Pro!");
      await queryClient.invalidateQueries(trpc.billing.me.queryOptions());
      await queryClient.invalidateQueries(trpc.usage.status.queryOptions());
    },
    onError: (error) => {
      toast.error(error.message || "Payment verification failed");
    },
  });

  const requireSignIn = () => {
    router.push("/sign-in?callbackUrl=/pricing");
  };

  const handleGoPro = async () => {
    if (!signedIn) {
      requireSignIn();
      return;
    }
    if (isPro) {
      toast.message("You're already on Pro");
      return;
    }
    if (!config?.razorpayEnabled) {
      toast.error("Billing isn't configured yet");
      return;
    }

    setCheckoutPending(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error("Could not load Razorpay checkout");
      }

      const order = await createCheckout.mutateAsync();
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: "#ee3f24" },
        handler: (response) => {
          verifyPayment.mutate({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => setCheckoutPending(false),
        },
      });
      rzp.open();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start checkout",
      );
    } finally {
      setCheckoutPending(false);
    }
  };

  const handleApplyCoupon = () => {
    if (!signedIn) {
      requireSignIn();
      return;
    }
    if (!coupon.trim()) {
      toast.error("Enter a coupon code");
      return;
    }
    applyCoupon.mutate({ code: coupon.trim() });
  };

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col">
      <section className="space-y-10 pt-10 md:pt-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <p className="mb-3 text-sm font-semibold text-primary">
            no tiers maze, just two
          </p>
          <h1 className="font-display text-balance text-3xl font-bold tracking-tight md:text-5xl">
            Pricing that&apos;s honestly simple.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-sm text-muted-foreground md:text-base">
            Start with free credits and a full workspace. Pro is {priceLabel}{" "}
            when you need higher limits, priority generation, or a coupon
            upgrade.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="flex flex-col rounded-2xl border-2 border-border bg-card p-6 shadow-lg md:p-8">
            <div>
              <p className="font-display text-2xl font-bold tracking-tight">
                Free
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                For trying ideas and shipping small builds.
              </p>
            </div>
            <p className="font-display mt-6 text-5xl font-bold tracking-tight">
              $0
            </p>
            <ul className="mt-8 flex-1 space-y-3.5">
              {freeFeatures.map((feature) => (
                <FeatureItem key={feature.text} {...feature} />
              ))}
            </ul>
            <Button asChild variant="outline" size="lg" className="mt-8 w-full">
              <Link
                href={
                  signedIn ? "/?compose=1" : "/sign-in?callbackUrl=/?compose=1"
                }
              >
                Start free
              </Link>
            </Button>
          </div>

          <div
            className={cn(
              "relative flex flex-col rounded-2xl border-2 border-border bg-surface-yellow p-6 shadow-lg md:p-8",
              "text-foreground",
            )}
          >
            <span className="absolute -top-3 right-4 rounded-full border-2 border-border bg-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-background">
              For regular builders
            </span>
            <div>
              <p className="font-display text-2xl font-bold tracking-tight">
                Pro
              </p>
              <p className="mt-1 text-sm text-foreground/70">
                For watching your whole build queue.
              </p>
            </div>
            <p className="font-display mt-6 text-4xl font-bold tracking-tight md:text-5xl">
              {priceLabel}
            </p>
            <ul className="mt-8 flex-1 space-y-3.5">
              {proFeatures.map((feature) => (
                <FeatureItem key={feature.text} {...feature} />
              ))}
            </ul>
            <Button
              size="lg"
              className="mt-8 w-full"
              disabled={
                sessionPending ||
                checkoutPending ||
                createCheckout.isPending ||
                verifyPayment.isPending ||
                isPro
              }
              onClick={handleGoPro}
            >
              {(checkoutPending || createCheckout.isPending) && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {isPro ? "You're on Pro" : "Go Pro →"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-md md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label
                htmlFor="coupon"
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <TicketIcon className="size-4 text-primary" />
                Have a coupon code?
              </label>
              <p className="text-xs text-muted-foreground">
                Enter a valid code to convert your account to Pro without
                checkout.
              </p>
              <Input
                id="coupon"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="ENTER-CODE"
                className="h-11 font-mono uppercase tracking-wide"
                disabled={isPro || applyCoupon.isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplyCoupon();
                  }
                }}
              />
            </div>
            <Button
              size="lg"
              variant="secondary"
              className="h-11 shrink-0 sm:w-40"
              disabled={isPro || applyCoupon.isPending || !coupon.trim()}
              onClick={handleApplyCoupon}
            >
              {applyCoupon.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Apply coupon"
              )}
            </Button>
          </div>
          {isPro && (
            <p className="mt-3 text-sm font-medium text-primary">
              Pro is active
              {billing?.planExpiresAt
                ? ` until ${new Date(billing.planExpiresAt).toLocaleDateString()}`
                : " (no expiry)"}
              .
            </p>
          )}
        </div>

        <div className="space-y-4 pb-10 pt-4 text-center">
          <div className="mx-auto mb-2 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Image src="/logo.svg" alt="" width={14} height={14} />
            What Pro unlocks
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            More credits. Faster builds. Same workspace.
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Payments are handled securely by Razorpay. Coupons grant Pro
            instantly when redeemed on a signed-in account.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Page;
