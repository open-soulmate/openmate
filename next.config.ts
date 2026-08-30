import type { NextConfig } from "next";

const soulApiUrl = process.env.SOUL_API_URL || "http://localhost:8090";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["192.168.31.82", "100.76.2.155", "172.17.0.1", "172.18.0.1"],
  turbopack: {
    root: '/home/climbing/openmate',
  },
  async rewrites() {
    return [
      {
        source: "/api/soul/:path*",
        destination: `${soulApiUrl}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.githubusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
