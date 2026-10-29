import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { loadRootEnv } from "@agentshelf/core/env";

const here = path.dirname(fileURLToPath(import.meta.url));
// Share one .env at the monorepo root between the web app and the MCP server.
loadRootEnv(here);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@agentshelf/core", "@agentshelf/shared"],
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "postgres", "bcryptjs", "@anthropic-ai/sdk", "openai"],
  turbopack: { root: path.join(here, "../..") },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  experimental: { serverActions: { bodySizeLimit: "45mb" } },
};

export default nextConfig;
