import { linkWhatsApp } from "./dados";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-vc-bege/45 to-vc-creme">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <p className="mb-4 inline-block rounded-full bg-vc-verde/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-vc-verde">
          Quando a família não pode estar, nós estamos
        </p>

        <h1 className="font-serif text-3xl leading-tight text-vc-verde sm:text-5xl sm:leading-[1.15]">
          Sua mãe precisa ir ao médico e você não consegue sair do trabalho?
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-vc-texto/85 sm:text-xl">
          Seu pai precisa resolver coisas na rua, mas você prefere que ele não
          vá sozinho?
        </p>

        <p className="mt-4 max-w-2xl text-base text-vc-texto/75 sm:text-lg">
          O <strong className="text-vc-marrom">Vou Contigo</strong> acompanha em
          consultas, exames, mercado, farmácia e compromissos do dia a dia.
          Acompanhamos, esperamos, levamos e buscamos — e mantemos você
          informado.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={linkWhatsApp()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-vc-verde px-7 py-4 text-center text-base font-semibold text-vc-creme shadow-sm transition hover:bg-vc-verde-claro"
          >
            Falar no WhatsApp
          </a>
          <a
            href="#solicitar"
            className="rounded-full border border-vc-marrom/40 px-7 py-4 text-center text-base font-semibold text-vc-marrom transition hover:bg-vc-bege/40"
          >
            Pedir um contato
          </a>
        </div>

        <p className="mt-10 max-w-md border-l-2 border-vc-marrom/40 pl-4 font-serif text-lg italic text-vc-marrom sm:text-xl">
          Mais autonomia para quem você ama. Mais tranquilidade para você.
        </p>
      </div>
    </section>
  );
}
