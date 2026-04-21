import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Forward API calls to the Express server in dev so the wallet
    // page doesn't need CORS. In production these two services will
    // live behind the same domain anyway.
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
