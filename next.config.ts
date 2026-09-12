import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets CI/agents run `NEXT_DIST_DIR=.next-build next build` while `next dev` is using `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
