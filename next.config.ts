import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres locale in WebAssembly) va caricato da Node, non impacchettato
  serverExternalPackages: ["@electric-sql/pglite"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
