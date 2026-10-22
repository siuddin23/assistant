import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" }, // impor file besar
  },
};

export default nextConfig;
