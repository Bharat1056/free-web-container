import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * Keep tooling packages out of the Next bundle.
   * madge pulls optional Vue/template engines that break webpack resolution;
   * tree-sitter uses native bindings that must load from node_modules at runtime.
   */
  serverExternalPackages: [
    "madge",
    "dependency-tree",
    "precinct",
    "detective-vue2",
    "@vue/compiler-sfc",
    "filing-cabinet",
    "module-definition",
    "tree-sitter",
    "tree-sitter-typescript",
    "@llamaindex/node-parser",
    "@llamaindex/core",
    "@llamaindex/env",
    "razorpay",
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
