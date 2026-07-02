/** @type {import('next').NextConfig} */
const nextConfig = {
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
