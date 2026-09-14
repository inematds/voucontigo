import type { Metadata } from "next";
import Link from "next/link";
import BotaoSair from "@/components/portal/botao-sair";
import { linkWhatsApp } from "@/components/landing/dados";

export const metadata: Metadata = {
  title: "Não encontramos seu cadastro — Vou Contigo",
  robots: { index: false, follow: false },
};

export default function SemCadastroPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-vc-bege-escuro bg-white/70 p-6 shadow-sm">
        <p className="font-serif text-2xl font-bold text-vc-verde">
          Não encontramos o seu cadastro
        </p>
        <p className="mt-3 text-base text-vc-texto/80">
          O e-mail que você usou ainda não está ligado a uma conta do Vou Contigo. Isso costuma
          acontecer quando o cadastro foi feito com outro e-mail ou só pelo WhatsApp.
        </p>
        <p className="mt-3 text-base text-vc-texto/80">
          Fale com a gente que resolvemos na hora.
        </p>

        <a
          href={linkWhatsApp(
            "Olá! Tentei entrar no portal do Vou Contigo e não encontrou meu cadastro.",
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block rounded-full bg-vc-verde px-6 py-4 text-center text-base font-semibold text-vc-creme transition hover:bg-vc-verde-claro"
        >
          Falar no WhatsApp
        </a>

        <div className="mt-4">
          <BotaoSair rotulo="Sair e tentar outro e-mail" largo />
        </div>

        <p className="mt-6 text-center text-sm text-vc-texto/60">
          <Link href="/" className="underline underline-offset-4">
            Voltar para o site
          </Link>
        </p>
      </div>
    </main>
  );
}
