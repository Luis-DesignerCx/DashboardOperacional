/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Comprime respostas HTTP
  compress: true,
  // Otimiza imagens
  images: { unoptimized: false },
  // Remove headers de debug em produção
  poweredByHeader: false,
};

export default nextConfig;
