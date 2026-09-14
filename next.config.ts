import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build enxuto para rodar em container (VPS). Na Vercel é ignorado.
  output: "standalone",
};

export default nextConfig;
