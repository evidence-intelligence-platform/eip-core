import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker runner stage (and Railway) can run
  // the app with a bare `node server.js` — the Dockerfile depends on this.
  output: "standalone",
};

export default nextConfig;
