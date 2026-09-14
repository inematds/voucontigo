import type { Metadata } from "next";
import BotaoSair from "@/components/painel/botao-sair";
import { BarraInferior, Sidebar } from "@/components/painel/navegacao";
import { exigirPerfil } from "../_lib/dados";

export const metadata: Metadata = {
  title: "Painel — Vou Contigo",
  robots: { index: false, follow: false },
};

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await exigirPerfil();
  const ehGestora = perfil.papel === "gestora";

  return (
    <div className="flex min-h-dvh bg-vc-creme">
      <Sidebar nome={perfil.nome || "Equipe"} ehGestora={ehGestora}>
        <BotaoSair largo />
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-vc-bege-escuro px-4 py-3 md:hidden">
          <p className="font-serif text-lg font-bold text-vc-verde">
            Vou Contigo
          </p>
          <BotaoSair />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      <BarraInferior ehGestora={ehGestora} />
    </div>
  );
}
