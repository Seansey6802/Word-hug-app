import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prototype: never expose a powered-by header, keep gift links out of search.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/h/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
