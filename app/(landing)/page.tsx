import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Servicos } from "@/components/landing/Servicos";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { Planos } from "@/components/landing/Planos";
import { QuemSomos } from "@/components/landing/QuemSomos";
import { NaoFazemos } from "@/components/landing/NaoFazemos";
import { Faq } from "@/components/landing/Faq";
import { FormSolicitacao } from "@/components/landing/FormSolicitacao";
import { CtaFlutuante } from "@/components/landing/CtaFlutuante";
import { Rodape } from "@/components/landing/Rodape";

const TITULO = "Vou Contigo — acompanhamento em consultas, exames e rotina";
const DESCRICAO =
  "Sua mãe precisa ir ao médico e você não consegue sair do trabalho? Acompanhamos em consultas, exames, mercado, farmácia e compromissos do dia a dia. Mais autonomia para quem você ama. Mais tranquilidade para você.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://voucontigo.vercel.app",
  ),
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Vou Contigo",
    title: TITULO,
    description: DESCRICAO,
    images: [{ url: "/logo.jpg", width: 1024, height: 1024, alt: "Vou Contigo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRICAO,
    images: ["/logo.jpg"],
  },
};

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Servicos />
        <ComoFunciona />
        <Planos />
        <QuemSomos />
        <NaoFazemos />
        <Faq />
        <FormSolicitacao />
      </main>
      <Rodape />
      <CtaFlutuante />
    </>
  );
}
