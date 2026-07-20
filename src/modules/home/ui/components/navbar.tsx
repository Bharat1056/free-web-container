"use client";

import Link from "next/link";
import Image from "next/image";
import { CrownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserControl } from "@/components/user-control";
import { AppearanceControl } from "@/components/appearance-control";
import { useScroll } from "@/hooks/use-scroll";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  const scrolled = useScroll();
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);

  return (
    <nav
      className={cn(
        "fixed top-0 right-0 left-0 z-50 border-b-2 border-border transition-[background-color,box-shadow] duration-200",
        scrolled ? "bg-card shadow-sm" : "bg-background",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <Image src="/logo.svg" alt="Vibe" width={24} height={24} />
          <span className="font-display text-base font-bold tracking-tight">
            Vibe
          </span>
        </Link>

        <div className="flex items-center gap-3 md:gap-5">
          <AppearanceControl />
          {!isPending && !signedIn && (
            <>
              <Button asChild size="sm" className="h-9">
                <Link href="/pricing">
                  <CrownIcon className="size-3.5" />
                  Pricing
                </Link>
              </Button>
              <Button asChild size="sm" className="h-9">
                <Link href="/sign-in?callbackUrl=/?compose=1">
                  Get started
                </Link>
              </Button>
            </>
          )}
          {!isPending && signedIn && <UserControl showName />}
        </div>
      </div>
    </nav>
  );
};
