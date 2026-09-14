import { PASSOS } from "./dados";

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="bg-vc-bege/35 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="font-serif text-2xl text-vc-verde sm:text-3xl">
          Como funciona
        </h2>
        <p className="mt-3 max-w-2xl text-vc-texto/75">
          Três passos simples. Nada de cadastro complicado nem app para a pessoa
          acompanhada baixar.
        </p>

        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {PASSOS.map((passo) => (
            <li
              key={passo.numero}
              className="rounded-2xl border border-vc-bege-escuro/60 bg-vc-creme p-6"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-vc-verde font-serif text-lg font-semibold text-vc-creme">
                {passo.numero}
              </span>
              <h3 className="mt-4 font-semibold text-vc-verde">{passo.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-vc-texto/75">
                {passo.texto}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
