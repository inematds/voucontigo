import type { Metadata } from "next";
import Link from "next/link";
import BotaoSair from "@/components/portal/botao-sair";
import { exigirFamiliar } from "../_lib/dados";

export const metadata: Metadata = {
  title: "Minha conta — Vou Contigo",
  robots: { index: false, follow: false },
};

export default async function MinhaContaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { cliente } = await exigirFamiliar();
  const primeiroNome = (cliente.nome || "").split(" ")[0] || "você";

  return (
    <div className="min-h-dvh bg-vc-creme">
      <header className="border-b border-vc-bege-escuro bg-gradient-to-b from-vc-bege/40 to-vc-creme">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link href="/minha-conta" className="font-serif text-xl font-bold text-vc-verde">
              Vou Contigo
            </Link>
            <p className="truncate text-sm text-vc-texto/70">Olá, {primeiroNome}</p>
          </div>
          <BotaoSair />
        </div>

        <nav className="mx-auto flex w-full max-w-3xl gap-2 overflow-x-auto px-4 pb-3 text-sm">
          <Link
            href="/minha-conta"
            className="whitespace-nowrap rounded-full border border-vc-bege-escuro px-4 py-2 font-semibold text-vc-texto/80 transition hover:bg-vc-bege/40"
          >
            Início
          </Link>
          <Link
            href="/minha-conta/horarios"
            className="whitespace-nowrap rounded-full border border-vc-bege-escuro px-4 py-2 font-semibold text-vc-texto/80 transition hover:bg-vc-bege/40"
          >
            Horários livres
          </Link>
          <a
            href="/minha-conta/calendario.ics"
            className="whitespace-nowrap rounded-full border border-vc-bege-escuro px-4 py-2 font-semibold text-vc-texto/80 transition hover:bg-vc-bege/40"
          >
            Adicionar ao calendário
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">{children}</main>

      <footer className="border-t border-vc-bege-escuro px-4 py-6 text-center text-xs text-vc-texto/60">
        Vou Contigo — acompanhamento e apoio à rotina. Não fazemos cuidados de saúde.
      </footer>
    </div>
  );
}
