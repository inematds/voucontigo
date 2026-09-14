import Link from "next/link";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, linkWhatsApp } from "./dados";

export function Rodape() {
  const ano = new Date().getFullYear();

  return (
    <footer className="border-t border-vc-bege bg-vc-bege/30 pb-28 pt-12 sm:pb-12">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-serif text-lg font-semibold text-vc-verde">
              Vou Contigo
            </p>
            <p className="mt-1 text-sm text-vc-texto/70">
              Acompanhamento e apoio para o seu dia a dia.
            </p>
            <p className="mt-3 font-serif text-sm italic text-vc-marrom">
              Mais autonomia para quem você ama. Mais tranquilidade para você.
            </p>
          </div>

          <nav className="flex flex-col gap-2 text-sm">
            <a
              href={linkWhatsApp()}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-vc-verde hover:underline"
            >
              Falar no WhatsApp
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-vc-texto/75 hover:underline"
            >
              Instagram {INSTAGRAM_HANDLE}
            </a>
            <Link
              href="/politica-de-privacidade"
              className="text-vc-texto/75 hover:underline"
            >
              Política de privacidade
            </Link>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-vc-bege-escuro/50 pt-5 text-xs text-vc-texto/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {ano} Vou Contigo. Serviço de companhia e apoio à rotina.</p>
          <Link href="/painel" className="hover:underline">
            Área da equipe
          </Link>
        </div>
      </div>
    </footer>
  );
}
