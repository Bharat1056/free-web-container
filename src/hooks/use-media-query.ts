"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string, defaultValue = false) {
  const [matches, setMatches] = useState(defaultValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    setMounted(true);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return { matches, mounted };
}

/** Defaults to desktop until mounted to avoid IDE flash on large screens */
export function useIsDesktop() {
  const { matches, mounted } = useMediaQuery("(min-width: 768px)", true);
  return mounted ? matches : true;
}
