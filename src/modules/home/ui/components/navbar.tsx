"use client";

import Link from "next/link";
import Image from "next/image";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { UserControl } from "@/components/user-control";
import { useScroll } from "@/hooks/use-scroll";
import { useCurrentTheme } from "@/hooks/use-current-theme";
import { cn } from "@/lib/utils";

const ThemeSwitcher = () => {
  const { setTheme } = useTheme();
  const currentTheme = useCurrentTheme();
  const isDark = currentTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <div className="flex items-center gap-2">
      <Sun className="h-4 w-4" />
      <Switch
        checked={isDark}
        onCheckedChange={toggleTheme}
        aria-label="Toggle theme"
      />
      <Moon className="h-4 w-4" />
    </div>
  );
};

export const Navbar = () => {
  const scrolled = useScroll();
  return (
    <nav
      className={cn(
        "p-4 bg-transparent fixed top-0 left-0 right-0 z-50 transition-all duration-200 border-b border-transparent",
        scrolled && "bg-background border-border"
      )}
    >
      <div className="max-w-5xl mx-auto w-full flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Heartifact" width={24} height={24} />
          <span className="font-semibold text-lg">Vibe</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <SignedOut>
            <div className="flex gap-2">
              <SignUpButton>
                <Button variant="outline" size="sm">
                  Sign up
                </Button>
              </SignUpButton>
              <SignInButton>
                <Button size="sm">Sign in</Button>
              </SignInButton>
            </div>
          </SignedOut>
          <SignedIn>
            <UserControl showName />
          </SignedIn>
        </div>
      </div>
    </nav>
  );
};
