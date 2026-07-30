import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

const sora = localFont({
  src: [
    { path: "../../Sora/static/Sora-Light.ttf",     weight: "300" },
    { path: "../../Sora/static/Sora-Regular.ttf",   weight: "400" },
    { path: "../../Sora/static/Sora-Medium.ttf",    weight: "500" },
    { path: "../../Sora/static/Sora-SemiBold.ttf",  weight: "600" },
    { path: "../../Sora/static/Sora-Bold.ttf",      weight: "700" },
    { path: "../../Sora/static/Sora-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DASH CR — GR Group",
  description: "Plataforma de Gestão de Cobrança, Carteira e Performance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${sora.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
