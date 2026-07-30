import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TeamWatcher — Work Intelligence",
  description: "Gestão de produtividade, dispositivos e políticas de trabalho para equipes.",
  icons: { icon: "/timewatcher-logo.png", shortcut: "/timewatcher-logo.png" },
  openGraph: {
    title: "TeamWatcher — Work Intelligence",
    description: "Produtividade com contexto.",
    images: [{ url: "/timewatcher-social.png", width: 1200, height: 630, alt: "TeamWatcher" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${geist.variable} ${mono.variable} ${display.variable}`}>{children}</body></html>;
}
