import { PLANOS, linkWhatsApp } from "./dados";

export function Planos() {
  return (
    <section id="planos" className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
      <h2 className="font-serif text-2xl text-vc-verde sm:text-3xl">Planos</h2>
      <p className="mt-3 max-w-2xl text-vc-texto/75">
        Escolha pelo tipo de compromisso. Se a sua família precisa de apoio
        toda semana, o pacote mensal sai mais em conta.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLANOS.map((plano) => (
          <div
            key={plano.nome}
            className={`flex flex-col rounded-2xl border bg-white/70 p-6 ${
              plano.recomendado
                ? "border-vc-verde ring-1 ring-vc-verde/30"
                : "border-vc-bege"
            }`}
          >
            {plano.recomendado && (
              <span className="mb-3 self-start rounded-full bg-vc-verde/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-vc-verde">
                Mais procurado
              </span>
            )}
            <h3 className="font-serif text-xl text-vc-verde">{plano.nome}</h3>
            <p className="mt-1 text-sm font-medium text-vc-marrom">
              {plano.destaque}
            </p>

            <p className="mt-4 text-3xl font-semibold text-vc-texto">
              {plano.preco}
              {plano.periodo && (
                <span className="ml-1 text-sm font-normal text-vc-texto/60">
                  {plano.periodo}
                </span>
              )}
            </p>

            <p className="mt-3 text-sm text-vc-texto/75">{plano.descricao}</p>

            <ul className="mt-4 space-y-2 text-sm text-vc-texto/80">
              {plano.itens.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-vc-verde">
                    •
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {plano.precos && (
              <dl className="mt-5 space-y-1.5 rounded-xl bg-vc-bege/40 p-4 text-sm">
                {plano.precos.map((linha) => (
                  <div key={linha.rotulo} className="flex justify-between gap-3">
                    <dt className="text-vc-texto/75">{linha.rotulo}</dt>
                    <dd className="font-semibold text-vc-texto">{linha.valor}</dd>
                  </div>
                ))}
              </dl>
            )}

            <a
              href={linkWhatsApp(
                `Olá! Vi o site do Vou Contigo e gostaria de saber mais sobre o plano ${plano.nome}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 rounded-full bg-vc-verde px-5 py-3 text-center text-sm font-semibold text-vc-creme transition hover:bg-vc-verde-claro"
            >
              Quero este plano
            </a>
          </div>
        ))}
      </div>

      <p className="mt-6 rounded-xl border border-vc-bege bg-vc-bege/25 p-4 text-sm text-vc-texto/75">
        <strong className="text-vc-marrom">Valores iniciais.</strong> Deslocamento
        especial (distâncias maiores, estacionamento e pedágio) é cobrado à
        parte e sempre informado antes.
      </p>
    </section>
  );
}
