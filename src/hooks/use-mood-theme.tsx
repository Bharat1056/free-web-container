"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { moodThemes } from "@/theme";

interface MoodThemeContextType {
  currentMoodTheme: string;
  setMoodTheme: (themeName: string) => void;
  availableThemes: typeof moodThemes;
}

const MoodThemeContext = createContext<MoodThemeContextType | undefined>(
  undefined
);

export const useMoodTheme = () => {
  const context = useContext(MoodThemeContext);
  if (context === undefined) {
    throw new Error("useMoodTheme must be used within a MoodThemeProvider");
  }
  return context;
};

export const MoodThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentMoodTheme, setCurrentMoodTheme] = useState("default");

  const setMoodTheme = (themeName: string) => {
    const theme = moodThemes.find((t) => t.name === themeName);
    if (!theme) return;

    setCurrentMoodTheme(themeName);

    // Store the theme preference in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("mood-theme", themeName);
    }

    // Apply the theme CSS variables to the document
    applyThemeVariables(theme.theme);
  };

  const applyThemeVariables = (theme: {
    root: Record<string, string>;
    dark: Record<string, string>;
  }) => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    // Apply root (light) theme variables directly to :root
    Object.entries(theme.root).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Apply dark theme variables by creating CSS variables that override in dark mode
    const darkStyles = Object.entries(theme.dark)
      .map(([key, value]) => `    ${key}: ${value} !important;`)
      .join("\n");

    // Remove existing mood theme dark styles
    const existingMoodDarkStyle = document.getElementById(
      "mood-theme-dark-styles"
    );
    if (existingMoodDarkStyle) {
      existingMoodDarkStyle.remove();
    }

    // Add new dark theme styles with higher specificity and !important
    const style = document.createElement("style");
    style.id = "mood-theme-dark-styles";
    style.textContent = `
      .dark,
      html.dark,
      [data-theme="dark"] {
${darkStyles}
      }
    `;
    document.head.appendChild(style);
  };

  // Initialize theme on mount and watch for dark mode changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTheme = localStorage.getItem("mood-theme");
    if (savedTheme && moodThemes.find((t) => t.name === savedTheme)) {
      setMoodTheme(savedTheme);
    } else {
      // Apply default theme
      setMoodTheme("default");
    }

    // Watch for dark mode class changes and reapply theme
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          const currentTheme = localStorage.getItem("mood-theme") || "default";
          const theme = moodThemes.find((t) => t.name === currentTheme);
          if (theme) {
            // Small delay to ensure dark class is fully applied
            setTimeout(() => applyThemeVariables(theme.theme), 0);
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const value: MoodThemeContextType = {
    currentMoodTheme,
    setMoodTheme,
    availableThemes: moodThemes,
  };

  return (
    <MoodThemeContext.Provider value={value}>
      {children}
    </MoodThemeContext.Provider>
  );
};
