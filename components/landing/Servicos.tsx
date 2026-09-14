import { SERVICOS } from "./dados";

export function Servicos() {
  return (
    <section id="o-que-fazemos" className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
      <h2 className="font-serif text-2xl text-vc-verde sm:text-3xl">
        O que fazemos
      </h2>
      <p className="mt-3 max-w-2xl text-vc-texto/75">
        Companhia e apoio prático nos compromissos da rotina — com paciência,
        discrição e respeito pelo tempo de cada pessoa.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICOS.map((servico) => (
          <li
            key={servico.titulo}
            className="rounded-2xl border border-vc-bege bg-white/60 p-5"
          >
            <span aria-hidden className="text-2xl">
              {servico.emoji}
            </span>
            <h3 className="mt-3 font-semibold text-vc-verde">{servico.titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-vc-texto/75">
              {servico.texto}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
