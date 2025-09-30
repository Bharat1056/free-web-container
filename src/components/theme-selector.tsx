"use client";

import { useState } from "react";
import { Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMoodTheme } from "@/hooks/use-mood-theme.tsx";

export const ThemeSelector = () => {
  const { currentMoodTheme, setMoodTheme, availableThemes } = useMoodTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleThemeChange = (themeName: string) => {
    setMoodTheme(themeName);
    setIsOpen(false);
  };

  const currentTheme = availableThemes.find(
    (t: { name: string }) => t.name === currentMoodTheme
  );

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 min-w-[120px] justify-start"
        >
          <Palette className="h-4 w-4" />
          <span className="capitalize">{currentTheme?.name || "Default"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Choose Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableThemes.map((theme: { name: string; description: string }) => (
          <DropdownMenuItem
            key={theme.name}
            onClick={() => handleThemeChange(theme.name)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col">
              <span className="font-medium capitalize">{theme.name}</span>
              <span className="text-xs text-muted-foreground">
                {theme.description}
              </span>
            </div>
            {currentMoodTheme === theme.name && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
