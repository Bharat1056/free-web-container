/** @deprecated Accent themes removed — light/dark only. */

import type { ReactNode } from "react";

export function AccentProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useAccent() {
  return {
    accent: "none" as const,
    setAccent: (_: string) => {},
    accents: [] as never[],
  };
}

/** @deprecated */
export const MoodThemeProvider = AccentProvider;

/** @deprecated */
export const useMoodTheme = () => ({
  currentMoodTheme: "none",
  setMoodTheme: (_: string) => {},
  availableThemes: [],
});
