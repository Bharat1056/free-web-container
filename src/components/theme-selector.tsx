"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMoodTheme } from "@/hooks/use-mood-theme.tsx";
import { cn } from "@/lib/utils";

interface ThemeCard {
  name: string;
  description: string;
  theme: {
    root: Record<string, string>;
    dark: Record<string, string>;
  };
}

export const ThemeSelector = () => {
  const { currentMoodTheme, setMoodTheme, availableThemes } = useMoodTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null);
  const [originalTheme, setOriginalTheme] = useState<string>("");

  const currentTheme = availableThemes.find(
    (t: ThemeCard) => t.name === currentMoodTheme
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setHoveredTheme(null);
    // Restore original theme if no selection was made
    if (originalTheme && hoveredTheme) {
      setMoodTheme(originalTheme);
    }
  }, [originalTheme, hoveredTheme, setMoodTheme]);

  const handleThemeChange = (themeName: string) => {
    setMoodTheme(themeName);
    setIsOpen(false);
    setHoveredTheme(null);
  };

  const handleThemeHover = (themeName: string) => {
    setHoveredTheme(themeName);
    // Temporarily apply the hovered theme
    setMoodTheme(themeName);
  };

  const handleThemeLeave = () => {
    setHoveredTheme(null);
    // Restore original theme
    if (originalTheme) {
      setMoodTheme(originalTheme);
    }
  };

  // Store original theme when modal opens
  useEffect(() => {
    if (isOpen) {
      setOriginalTheme(currentMoodTheme);
    }
  }, [isOpen, currentMoodTheme]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden"; // Prevent background scroll
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleClose]);

  const getThemeColors = (theme: ThemeCard) => {
    return [
      theme.theme.root["--primary"],
      theme.theme.root["--secondary"],
      theme.theme.root["--accent"],
      theme.theme.root["--background"],
    ].filter(Boolean);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 min-w-[120px] justify-start hover:scale-105 transition-transform"
      >
        <Palette className="h-4 w-4" />
        <span className="capitalize">{currentTheme?.name || "Default"}</span>
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0 duration-200"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="bg-background/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl p-6 w-[480px] max-w-[90vw]">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold">Choose Your Theme</h2>
                  <p className="text-sm text-muted-foreground">
                    Hover to preview, click to apply
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="h-8 w-8 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Theme Cards Grid */}
              <div className="grid grid-cols-2 gap-4">
                {availableThemes.map((theme: ThemeCard) => {
                  const colors = getThemeColors(theme);
                  const isSelected = currentMoodTheme === theme.name;
                  const isHovered = hoveredTheme === theme.name;

                  return (
                    <div
                      key={theme.name}
                      className={cn(
                        "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:scale-105",
                        "bg-card hover:bg-accent/10",
                        isSelected
                          ? "border-primary shadow-lg ring-2 ring-primary/20"
                          : "border-border hover:border-primary/50",
                        isHovered && "shadow-xl"
                      )}
                      onClick={() => handleThemeChange(theme.name)}
                      onMouseEnter={() => handleThemeHover(theme.name)}
                      onMouseLeave={handleThemeLeave}
                    >
                      {/* Color Swatches */}
                      <div className="flex gap-2 mb-3">
                        {colors.slice(0, 4).map((color, index) => (
                          <div
                            key={index}
                            className="w-6 h-6 rounded-full border-2 border-border shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>

                      {/* Theme Info */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium capitalize text-foreground">
                            {theme.name}
                          </h3>
                          {isSelected && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {theme.description}
                        </p>
                      </div>

                      {/* Hover overlay */}
                      {isHovered && (
                        <div className="absolute inset-0 rounded-xl bg-primary/5 pointer-events-none" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
