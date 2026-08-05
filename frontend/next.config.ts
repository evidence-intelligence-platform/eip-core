import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker runner stage (and Railway) can run
  // the app with a bare `node server.js` — the Dockerfile depends on this.
  output: "standalone",
  // Do not 308-strip the trailing slash on /api/eip/* — the proxy forwards
  // the path verbatim to FastAPI, whose collection routes require the slash.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
