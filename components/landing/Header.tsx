import Image from "next/image";
import Link from "next/link";
import { linkWhatsApp } from "./dados";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-vc-bege/70 bg-vc-creme/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.jpg"
            alt="Vou Contigo"
            width={44}
            height={44}
            priority
            className="h-11 w-11 rounded-full object-cover ring-1 ring-vc-bege"
          />
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-lg font-semibold text-vc-verde">
              Vou Contigo
            </span>
            <span className="hidden text-xs text-vc-marrom sm:block">
              Acompanhamento e apoio para o seu dia a dia
            </span>
          </span>
        </Link>

        <a
          href={linkWhatsApp()}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-vc-verde px-4 py-2.5 text-sm font-semibold text-vc-creme transition hover:bg-vc-verde-claro"
        >
          Falar no WhatsApp
        </a>
      </div>
    </header>
  );
}
