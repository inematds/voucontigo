import { NAO_FAZEMOS } from "./dados";

export function NaoFazemos() {
  return (
    <section
      id="o-que-nao-fazemos"
      className="mx-auto max-w-5xl px-4 py-14 sm:py-20"
    >
      <div className="rounded-2xl border border-vc-marrom/25 bg-white/60 p-6 sm:p-8">
        <h2 className="font-serif text-2xl text-vc-marrom sm:text-3xl">
          O que não fazemos
        </h2>
        <p className="mt-3 max-w-2xl text-vc-texto/80">
          Preferimos ser claros desde o começo. O Vou Contigo é um serviço de
          companhia e apoio à rotina — <strong>não</strong> é um serviço de
          saúde. Não realizamos:
        </p>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {NAO_FAZEMOS.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 text-sm text-vc-texto/80"
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-vc-marrom/10 text-xs text-vc-marrom"
              >
                ✕
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-sm text-vc-texto/70">
          Quando o compromisso exigir um profissional de saúde, avisamos e
          ajudamos a família a se organizar — mas quem cuida da parte clínica é
          sempre quem tem formação para isso.
        </p>
      </div>
    </section>
  );
}
