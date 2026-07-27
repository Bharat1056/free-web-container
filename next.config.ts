import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * Ensure vendored tree-sitter WASM grammars ship with standalone builds.
   */
  outputFileTracingIncludes: {
    "/*": ["./resources/tree-sitter/**/*"],
  },
  /**
   * Keep tooling packages out of the Next bundle.
   * madge pulls optional Vue/template engines that break webpack resolution;
   * web-tree-sitter loads WASM from disk at runtime.
   */
  serverExternalPackages: [
    "madge",
    "dependency-tree",
    "precinct",
    "detective-vue2",
    "@vue/compiler-sfc",
    "filing-cabinet",
    "module-definition",
    "web-tree-sitter",
    "@llamaindex/node-parser",
    "@llamaindex/core",
    "@llamaindex/env",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
