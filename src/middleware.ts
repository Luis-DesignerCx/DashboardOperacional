export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/carteira/:path*",
    "/clientes/:path*",
    "/importacao/:path*",
    "/equipes/:path*",
    "/metas/:path*",
    "/comissao/:path*",
    "/relatorios/:path*",
    "/auditoria/:path*",
    "/configuracoes/:path*",
    "/solicitacoes/:path*",
    "/pendencias/:path*",
  ],
};
