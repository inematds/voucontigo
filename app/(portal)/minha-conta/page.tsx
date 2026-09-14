import Link from "next/link";
import CancelarVisita from "@/components/portal/cancelar-visita";
import FormSolicitar from "@/components/portal/form-solicitar";
import CopiarPix from "@/components/portal/copiar-pix";
import { linkWhatsApp } from "@/components/landing/dados";
import {
  MOBILIDADE_LABEL,
  STATUS_ATENDIMENTO_LABEL,
  TIPO_ATENDIMENTO_LABEL,
} from "@/lib/domain/types";
import {
  exigirFamiliar,
  lerConfiguracao,
  janelaDaConfig,
  lerOcupados,
  listarProximosAtendimentos,
  listarAcompanhados,
  listarPacotes,
  listarPagamentos,
  listarRelatorios,
  valorHoraDoPacote,
  STATUS_CANCELAVEIS,
} from "../_lib/dados";
import { taxaDeCancelamento } from "../_lib/taxa";
import { calcularSlotsLivres } from "../_lib/agendamento";
import {
  fmtData,
  fmtDataLonga,
  fmtMoeda,
  hhmm,
  hojeISO,
  minutosAgoraSP,
  somarDiasISO,
} from "../_lib/datas";

export const dynamic = "force-dynamic";

const CARTAO = "rounded-3xl border border-vc-bege-escuro bg-white/70 p-5 shadow-sm";
const TITULO = "font-serif text-xl font-bold text-vc-verde";

export default async function MinhaContaPage() {
  const { cliente } = await exigirFamiliar();

  const [proximos, acompanhados, pacotes, pagamentos, relatorios, { config, mapa }] =
    await Promise.all([
      listarProximosAtendimentos(cliente.id),
      listarAcompanhados(cliente.id),
      listarPacotes(cliente.id),
      listarPagamentos(cliente.id),
      listarRelatorios(cliente.id, 8),
      lerConfiguracao(),
    ]);

  const de = hojeISO();
  const { ocupados, aviso } = await lerOcupados(de, somarDiasISO(de, 14));
  const slots = calcularSlotsLivres({
    de,
    dias: 15,
    duracao_min: 120,
    janela: janelaDaConfig(mapa),
    ocupados,
    agora_min: minutosAgoraSP() + 120,
    limite: 24,
  });

  const agora = new Date();
  const pendentes = pagamentos.filter((p) => p.status === "pendente");
  const pagos = pagamentos.filter((p) => p.status === "pago");
  const pacotesAtivos = pacotes.filter((p) => p.status === "ativo");

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ próximas visitas */}
      <section className={CARTAO}>
        <h1 className={TITULO}>Próximas visitas</h1>

        {proximos.length === 0 ? (
          <p className="mt-3 text-base text-vc-texto/75">
            Nenhuma visita marcada por enquanto. Você pode pedir uma aqui embaixo.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {proximos.map((a) => {
              const acompanhado = acompanhados.find((x) => x.id === a.acompanhado_id);
              const taxa = taxaDeCancelamento(
                a,
                agora,
                config,
                valorHoraDoPacote(pacotes, a.pacote_id),
              );
              return (
                <li key={a.id} className="rounded-2xl border border-vc-bege-escuro p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-vc-verde/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-vc-verde">
                      {STATUS_ATENDIMENTO_LABEL[a.status]}
                    </span>
                    <span className="text-sm text-vc-texto/70">
                      {TIPO_ATENDIMENTO_LABEL[a.tipo]}
                    </span>
                  </div>

                  <p className="mt-2 font-serif text-lg text-vc-texto">
                    {fmtDataLonga(a.data)} às {hhmm(a.hora_prevista_inicio)}
                  </p>
                  <p className="text-sm text-vc-texto/75">
                    Com {acompanhado?.apelido || acompanhado?.nome || "—"} ·{" "}
                    {Math.round((a.duracao_prevista_min || 0) / 60)}h previstas
                  </p>
                  <p className="mt-1 text-sm text-vc-texto/75">Destino: {a.endereco_destino}</p>

                  {STATUS_CANCELAVEIS.includes(a.status) && (
                    <CancelarVisita
                      atendimentoId={a.id}
                      avisoTaxa={taxa.mensagem}
                      gratuito={taxa.gratuito}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-sm">
          <a
            href="/minha-conta/calendario.ics"
            className="font-semibold text-vc-marrom underline underline-offset-4"
          >
            Adicionar ao calendário
          </a>
        </p>
      </section>

      {/* ------------------------------------------------ solicitar */}
      <section className={CARTAO}>
        <h2 className={TITULO}>Pedir um acompanhamento</h2>
        <p className="mt-2 mb-4 text-sm text-vc-texto/75">
          Escolha um horário livre da agenda. A equipe confirma com você em seguida.
        </p>
        <FormSolicitar
          acompanhados={acompanhados.map((a) => ({
            id: a.id,
            nome: a.apelido || a.nome,
            endereco: a.endereco,
          }))}
          slots={slots}
          duracaoMin={120}
          aviso={aviso}
        />
        <p className="mt-3 text-sm text-vc-texto/70">
          Precisa de mais horas ou outro dia?{" "}
          <Link
            href="/minha-conta/horarios"
            className="font-semibold text-vc-marrom underline underline-offset-4"
          >
            Ver todos os horários livres
          </Link>
        </p>
      </section>

      {/* ------------------------------------------------ saldo */}
      <section className={CARTAO}>
        <h2 className={TITULO}>Saldo de horas</h2>
        {pacotesAtivos.length === 0 ? (
          <p className="mt-3 text-base text-vc-texto/75">Você não tem pacote ativo no momento.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {pacotesAtivos.map((p) => {
              const usado = Math.min(p.horas_usadas, p.horas_contratadas);
              const restante = Math.max(p.horas_contratadas - usado, 0);
              const pct =
                p.horas_contratadas > 0 ? Math.round((restante / p.horas_contratadas) * 100) : 0;
              return (
                <li key={p.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold text-vc-texto">{p.plano?.nome ?? "Pacote"}</p>
                    <p className="text-sm text-vc-texto/75">
                      {restante}h de {p.horas_contratadas}h
                    </p>
                  </div>
                  <div
                    className="mt-2 h-3 w-full overflow-hidden rounded-full bg-vc-bege/60"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Saldo do pacote ${p.plano?.nome ?? ""}`}
                  >
                    <div className="h-full rounded-full bg-vc-verde" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-vc-texto/60">
                    Válido até {fmtData(p.valido_ate)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ relatórios */}
      <section className={CARTAO}>
        <h2 className={TITULO}>Relatórios</h2>
        {relatorios.length === 0 ? (
          <p className="mt-3 text-base text-vc-texto/75">Ainda não há relatórios por aqui.</p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {relatorios.map((r) => (
                <li key={r.id} className="rounded-2xl border border-vc-bege-escuro p-4">
                  <p className="text-sm font-semibold text-vc-verde">
                    {fmtData(r.data)} · {TIPO_ATENDIMENTO_LABEL[r.tipo]}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-base text-vc-texto/85">
                    {r.relatorio_texto}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link
                href={`/minha-conta/relatorios/${relatorios[0].data.slice(0, 7)}`}
                className="font-semibold text-vc-marrom underline underline-offset-4"
              >
                Ver e imprimir os relatórios do mês
              </Link>
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------------ pagamentos */}
      <section className={CARTAO}>
        <h2 className={TITULO}>Pagamentos</h2>

        {pendentes.length > 0 && (
          <div className="mt-4 space-y-4">
            {pendentes.map((p) => (
              <div key={p.id} className="rounded-2xl border border-vc-marrom/30 bg-vc-bege/20 p-4">
                <p className="font-semibold text-vc-marrom">
                  {fmtMoeda(p.valor_centavos)} · a pagar
                </p>
                <p className="text-sm text-vc-texto/75">
                  {p.descricao ?? "Pacote de horas"}
                  {p.vencimento ? ` · vence em ${fmtData(p.vencimento)}` : ""}
                </p>
                {p.link_pagamento && (
                  <a
                    href={p.link_pagamento}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block rounded-full bg-vc-verde px-5 py-2 text-sm font-semibold text-vc-creme"
                  >
                    Abrir a cobrança
                  </a>
                )}
                {p.pix_copia_cola && <CopiarPix codigo={p.pix_copia_cola} />}
              </div>
            ))}
          </div>
        )}

        {pagos.length === 0 && pendentes.length === 0 ? (
          <p className="mt-3 text-base text-vc-texto/75">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pagos.slice(0, 10).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 text-sm text-vc-texto/75">
                <span>{p.descricao ?? "Pagamento"}</span>
                <span className="whitespace-nowrap">
                  {fmtMoeda(p.valor_centavos)} · pago
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ acompanhados */}
      <section className={CARTAO}>
        <h2 className={TITULO}>Quem acompanhamos</h2>
        {acompanhados.length === 0 ? (
          <p className="mt-3 text-base text-vc-texto/75">Nenhum cadastro por aqui ainda.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {acompanhados.map((a) => (
              <li key={a.id} className="rounded-2xl border border-vc-bege-escuro p-4">
                <p className="font-serif text-lg text-vc-texto">
                  {a.nome}
                  {a.apelido ? ` (${a.apelido})` : ""}
                </p>
                <p className="mt-1 text-sm text-vc-texto/75">{a.endereco}</p>
                {a.telefone && <p className="text-sm text-vc-texto/75">Telefone: {a.telefone}</p>}
                <p className="text-sm text-vc-texto/75">{MOBILIDADE_LABEL[a.mobilidade]}</p>
                {a.preferencias && (
                  <p className="mt-1 text-sm text-vc-texto/70">Preferências: {a.preferencias}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm">
          <a
            href={linkWhatsApp("Olá! Quero atualizar os dados do meu cadastro no Vou Contigo.")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-vc-marrom underline underline-offset-4"
          >
            Pedir alteração no WhatsApp
          </a>
        </p>
      </section>
    </div>
  );
}
