import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Forward API calls to the Express server so the browser sees
    // same-origin requests and we don't need CORS. In prod this points
    // at the Railway internal URL of the server service; in dev it
    // points at localhost:3000.
    const backend = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },
};

export default nextConfig;
