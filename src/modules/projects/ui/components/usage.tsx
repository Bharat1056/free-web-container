"use client";

import Link from "next/link";
import { CrownIcon } from "lucide-react";
import { formatDuration, intervalToDuration } from "date-fns";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { logError } from "@/lib/error-utils";
import { useTRPC } from "@/trpc/client";

interface Props {
  points: number;
  msBeforeNext: number;
}

export const Usage = ({ points, msBeforeNext }: Props) => {
  const trpc = useTRPC();
  const { data: billing } = useQuery(trpc.billing.me.queryOptions());
  const hasProAccess = billing?.isPro ?? false;

  const resetTime = useMemo(() => {
    try {
      return formatDuration(
        intervalToDuration({
          start: new Date(),
          end: new Date(new Date().getTime() + msBeforeNext),
        }),
        { format: ["months", "days", "hours"] }
      );
    } catch (error) {
      logError(error);
      return "Unknown";
    }
  }, [msBeforeNext]);

  return (
    <div className="rounded-t-xl border-2 border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-x-2">
        <div>
          <p className="text-sm font-semibold tracking-tight">
            {points} {hasProAccess ? "" : "free "}credits remaining
          </p>
          <p className="text-xs text-muted-foreground">Resets in {resetTime}</p>
        </div>
        {!hasProAccess && (
          <Button asChild size="sm" variant="tertiary" className="ml-auto h-8">
            <Link href="/pricing">
              <CrownIcon className="size-3.5" /> Upgrade
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
};
