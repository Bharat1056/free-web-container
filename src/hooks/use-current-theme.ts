import { useTheme } from "next-themes";
import { useEffect } from "react";
import { sanitizeTheme } from "@/lib/utils";

export const useCurrentTheme = () => {
  const { theme, systemTheme, setTheme } = useTheme();

  // Validate and clean up corrupted theme data on mount
  useEffect(() => {
    const validatedTheme = sanitizeTheme(theme);

    // If theme is corrupted, reset it and clear localStorage
    if (validatedTheme !== theme) {
      // Clear the corrupted theme from localStorage
      try {
        localStorage.removeItem("theme");
      } catch (error) {
        // Ignore localStorage errors (e.g., in SSR or private browsing)
        console.warn("Could not clear localStorage:", error);
      }

      // Set a valid theme
      setTheme(validatedTheme);
    }
  }, [theme, setTheme]);

  const currentTheme = sanitizeTheme(theme);

  if (currentTheme === "system") {
    return systemTheme ?? "light"; // fallback to light
  }

  return currentTheme;
};
