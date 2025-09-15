import { TreeItem } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely sanitize theme values to prevent DOM errors from corrupted localStorage
 * @param theme - The theme value to validate
 * @returns A safe theme value
 */
export function sanitizeTheme(theme: string | undefined | null): string {
  // If theme is undefined, null, or not a string, return default
  if (!theme || typeof theme !== "string") {
    return "light";
  }

  // Valid theme values that are safe to use as CSS classes
  const validThemes = ["light", "dark", "system"];

  // If theme is a valid theme name, return it
  if (validThemes.includes(theme)) {
    return theme;
  }

  // If theme looks like JSON, contains spaces, or is too long, return default
  if (
    theme.includes("{") ||
    theme.includes("}") ||
    theme.includes(" ") ||
    theme.includes('"') ||
    theme.length > 20 ||
    theme.includes("\n") ||
    theme.includes("\t")
  ) {
    return "light";
  }

  // Default fallback
  return "light";
}

/**
 * Convert a record of files to a tree structure.
 * @param files - Record of file paths to content
 * @returns Tree structure for TreeView component
 *
 * @example
 * Input: { "src/Button.tsx": "...", "README.md": "..." }
 * Output: [["src", "Button.tsx"], "README.md"]
 */
export function convertFilesToTreeItems(
  files: Record<string, string>
): TreeItem[] {
  // Define proper type for tree structure
  interface TreeNode {
    [key: string]: TreeNode | null;
  }

  // Build a tree structure first
  const tree: TreeNode = {};

  // Sort files to ensure consistent ordering
  const sortedPaths = Object.keys(files).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split("/");
    let current = tree;

    // Navigate/create the tree structure
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    // Add the file (leaf node)
    const fileName = parts[parts.length - 1];
    current[fileName] = null; // null indicates it's a file
  }

  // Convert tree structure to TreeItem format
  function convertNode(node: TreeNode, name?: string): TreeItem[] | TreeItem {
    const entries = Object.entries(node);

    if (entries.length === 0) {
      return name || "";
    }

    const children: TreeItem[] = [];

    for (const [key, value] of entries) {
      if (value === null) {
        // It's a file
        children.push(key);
      } else {
        // It's a folder
        const subTree = convertNode(value, key);
        if (Array.isArray(subTree)) {
          children.push([key, ...subTree]);
        } else {
          children.push([key, subTree]);
        }
      }
    }

    return children;
  }

  const result = convertNode(tree);
  return Array.isArray(result) ? result : [result];
}
