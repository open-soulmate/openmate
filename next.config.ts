import type { NextConfig } from "next";

const soulApiUrl = process.env.SOUL_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  devIndicators: false,
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
