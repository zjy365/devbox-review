import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
  ],
};

export default nextConfig;
