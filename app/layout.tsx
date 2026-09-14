import type { Metadata } from "next";
import { Nunito, Lora } from "next/font/google";
import "./globals.css";

const sans = Nunito({ variable: "--font-sans", subsets: ["latin"] });
const serif = Lora({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vou Contigo — Acompanhamento e apoio para o seu dia a dia",
  description:
    "Acompanhamos em consultas, exames, mercado, farmácia e compromissos do dia a dia. Mais autonomia para quem você ama. Mais tranquilidade para você.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
