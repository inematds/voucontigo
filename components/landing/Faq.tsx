import { FAQ } from "./dados";

export function Faq() {
  return (
    <section id="faq" className="bg-vc-bege/35 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="font-serif text-2xl text-vc-verde sm:text-3xl">
          Perguntas frequentes
        </h2>

        <div className="mt-8 space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.pergunta}
              className="group rounded-2xl border border-vc-bege-escuro/60 bg-vc-creme px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-vc-verde">
                {item.pergunta}
                <span
                  aria-hidden
                  className="shrink-0 text-xl text-vc-marrom transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-vc-texto/80">
                {item.resposta}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
