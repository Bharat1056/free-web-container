"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { sanitizeTheme } from "@/lib/utils";

const modes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

interface AppearanceControlProps {
  align?: "start" | "center" | "end";
  className?: string;
}

export const AppearanceControl = ({
  align = "end",
  className,
}: AppearanceControlProps) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentMode = sanitizeTheme(theme);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-2 px-2.5", className)}
          aria-label="Appearance settings"
        >
          {mounted && currentMode === "dark" ? (
            <Moon className="size-3.5" />
          ) : mounted && currentMode === "system" ? (
            <Monitor className="size-3.5" />
          ) : (
            <Sun className="size-3.5" />
          )}
          <span className="hidden text-xs font-medium sm:inline">
            Appearance
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-56 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">Theme</p>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg border-2 border-border bg-muted/40 p-1"
          role="radiogroup"
          aria-label="Color mode"
        >
          {modes.map(({ value, label, icon: Icon }) => {
            const selected = mounted && currentMode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                  selected
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** @deprecated Use AppearanceControl */
export const ThemeSelector = AppearanceControl;
