import Link from "next/link";
import EnviarHorarios from "@/components/portal/enviar-horarios";
import {
  exigirFamiliar,
  lerConfiguracao,
  janelaDaConfig,
  lerOcupados,
} from "../../_lib/dados";
import { calcularSlotsLivres } from "../../_lib/agendamento";
import { fmtDataLonga, hojeISO, minutosAgoraSP, somarDiasISO } from "../../_lib/datas";

export const dynamic = "force-dynamic";

const DURACOES = [
  { min: 120, rotulo: "2 horas" },
  { min: 240, rotulo: "4 horas" },
];

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ duracao?: string }>;
}) {
  await exigirFamiliar();
  const sp = await searchParams;
  const duracaoMin = sp.duracao === "240" ? 240 : 120;

  const { mapa } = await lerConfiguracao();
  const de = hojeISO();
  const { ocupados, aviso } = await lerOcupados(de, somarDiasISO(de, 21));
  const slots = calcularSlotsLivres({
    de,
    dias: 22,
    duracao_min: duracaoMin,
    janela: janelaDaConfig(mapa),
    ocupados,
    agora_min: minutosAgoraSP() + 120,
    limite: 40,
  });

  const porDia = new Map<string, string[]>();
  for (const s of slots) {
    const lista = porDia.get(s.data) ?? [];
    lista.push(s.hora);
    porDia.set(s.data, lista);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-vc-bege-escuro bg-white/70 p-5 shadow-sm">
        <h1 className="font-serif text-xl font-bold text-vc-verde">Horários livres</h1>
        <p className="mt-2 text-sm text-vc-texto/75">
          Escolha a duração e veja os próximos horários disponíveis na agenda.
        </p>

        <div className="mt-4 flex gap-2">
          {DURACOES.map((d) => (
            <Link
              key={d.min}
              href={`/minha-conta/horarios?duracao=${d.min}`}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                d.min === duracaoMin
                  ? "bg-vc-verde text-vc-creme"
                  : "border border-vc-bege-escuro text-vc-texto/80 hover:bg-vc-bege/40"
              }`}
            >
              {d.rotulo}
            </Link>
          ))}
        </div>

        {aviso && <p className="mt-4 text-sm text-vc-marrom">{aviso}</p>}

        {porDia.size === 0 ? (
          <p className="mt-5 text-base text-vc-texto/75">
            Não encontramos horários livres para essa duração nos próximos dias. Chame no WhatsApp
            que a gente procura um encaixe.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {[...porDia.entries()].map(([data, horas]) => (
              <li key={data}>
                <p className="text-sm font-semibold text-vc-verde">{fmtDataLonga(data)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {horas.map((h) => (
                    <span
                      key={h}
                      className="rounded-full border border-vc-bege-escuro bg-vc-creme px-4 py-2 text-sm text-vc-texto"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-vc-bege-escuro bg-white/70 p-5 shadow-sm">
        <h2 className="font-serif text-xl font-bold text-vc-verde">Receber essa lista</h2>
        <p className="mt-2 mb-4 text-sm text-vc-texto/75">
          Mandamos os horários para você decidir com calma.
        </p>
        <EnviarHorarios duracaoMin={duracaoMin} />
      </section>

      <p className="text-center text-sm">
        <Link
          href="/minha-conta"
          className="font-semibold text-vc-marrom underline underline-offset-4"
        >
          Voltar para a minha conta
        </Link>
      </p>
    </div>
  );
}
