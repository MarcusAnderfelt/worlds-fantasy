import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const repo = "worlds-fantasy"; // <-- make sure this matches your GitHub repo name exactly

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? `/${repo}` : "",
  assetPrefix: isProd ? `/${repo}/` : "",
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true, // 🚀 prevents ESLint errors from breaking GitHub Actions builds
  },
};

export default nextConfig;
