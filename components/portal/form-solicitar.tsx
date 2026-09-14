"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { solicitarAcompanhamento, type EstadoAcao } from "@/app/(portal)/_lib/acoes";
import type { SlotDisponivel } from "@/lib/domain/types";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";

export interface OpcaoAcompanhado {
  id: string;
  nome: string;
  endereco: string;
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-vc-verde px-6 py-4 text-base font-semibold text-vc-creme transition hover:bg-vc-verde-claro disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Pedir acompanhamento"}
    </button>
  );
}

const CAMPO =
  "w-full rounded-2xl border border-vc-bege-escuro bg-vc-creme px-4 py-3 text-base text-vc-texto outline-none focus:border-vc-verde";

function rotuloData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function FormSolicitar({
  acompanhados,
  slots,
  duracaoMin,
  aviso,
}: {
  acompanhados: OpcaoAcompanhado[];
  slots: SlotDisponivel[];
  duracaoMin: number;
  aviso: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [quem, setQuem] = useState(acompanhados[0]?.id ?? "");
  const [estado, acao] = useActionState<EstadoAcao, FormData>(solicitarAcompanhamento, {});

  const saidaPadrao = useMemo(
    () => acompanhados.find((a) => a.id === quem)?.endereco ?? "",
    [acompanhados, quem],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const s of slots) {
      const lista = mapa.get(s.data) ?? [];
      lista.push(s.hora);
      mapa.set(s.data, lista);
    }
    return [...mapa.entries()];
  }, [slots]);

  if (acompanhados.length === 0) {
    return (
      <p className="text-sm text-vc-texto/70">
        Ainda não há ninguém cadastrado para acompanhar. Fale com a gente no WhatsApp.
      </p>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-full bg-vc-verde px-6 py-4 text-base font-semibold text-vc-creme transition hover:bg-vc-verde-claro"
      >
        Solicitar novo acompanhamento
      </button>
    );
  }

  if (estado.ok) {
    return (
      <p className="rounded-2xl bg-vc-verde/10 px-4 py-3 text-sm text-vc-verde">{estado.ok}</p>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="duracao_min" value={duracaoMin} />

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-vc-texto/80">Quem vamos acompanhar</span>
        <select
          name="acompanhado_id"
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          className={CAMPO}
        >
          {acompanhados.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-vc-texto/80">Tipo de compromisso</span>
        <select name="tipo" className={CAMPO} defaultValue="consulta">
          {Object.entries(TIPO_ATENDIMENTO_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-vc-texto/80">
          Dia e horário (livres na agenda)
        </legend>
        {aviso && <p className="mb-2 text-sm text-vc-marrom">{aviso}</p>}
        {porDia.length === 0 ? (
          <p className="text-sm text-vc-texto/70">
            Sem horários livres nos próximos dias. Chame no WhatsApp que a gente encaixa.
          </p>
        ) : (
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-2xl bg-vc-bege/25 p-3">
            {porDia.map(([data, horas]) => (
              <div key={data}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-vc-verde">
                  {rotuloData(data)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {horas.map((hora) => (
                    <label key={`${data}T${hora}`} className="cursor-pointer">
                      <input
                        type="radio"
                        name="slot"
                        value={`${data}T${hora}`}
                        required
                        className="peer sr-only"
                      />
                      <span className="block rounded-full border border-vc-bege-escuro bg-vc-creme px-4 py-2 text-sm text-vc-texto peer-checked:border-vc-verde peer-checked:bg-vc-verde peer-checked:text-vc-creme">
                        {hora}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-vc-texto/80">Endereço de saída</span>
        <input name="saida" required defaultValue={saidaPadrao} key={saidaPadrao} className={CAMPO} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-vc-texto/80">Endereço de destino</span>
        <input
          name="destino"
          required
          placeholder="Clínica, hospital, mercado…"
          className={CAMPO}
        />
      </label>

      {estado.erro && <p className="text-sm text-vc-marrom">{estado.erro}</p>}

      <Enviar />
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="w-full rounded-full border border-vc-bege-escuro px-5 py-3 text-sm font-semibold text-vc-texto/80 transition hover:bg-vc-bege/40"
      >
        Fechar
      </button>
    </form>
  );
}
