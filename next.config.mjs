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

  // Headers de segurança básicos -- ausência total era um achado da
  // auditoria de segurança (2026-09-15). Só os que não têm risco de
  // quebrar nada em uso normal (sem CSP por enquanto -- uma CSP mal
  // calibrada pode bloquear script/estilo legítimo da própria aplicação,
  // e isso precisa de teste dedicado antes de entrar em produção).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
