"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelarAtendimento, type EstadoAcao } from "@/app/(portal)/_lib/acoes";

function Confirmar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-vc-marrom px-5 py-3 text-sm font-semibold text-vc-creme transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Cancelando…" : "Confirmar cancelamento"}
    </button>
  );
}

export default function CancelarVisita({
  atendimentoId,
  avisoTaxa,
  gratuito,
}: {
  atendimentoId: string;
  avisoTaxa: string;
  gratuito: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState<EstadoAcao, FormData>(cancelarAtendimento, {});

  if (estado.ok) {
    return (
      <p className="mt-3 rounded-2xl bg-vc-verde/10 px-4 py-3 text-sm text-vc-verde">{estado.ok}</p>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-3 rounded-full border border-vc-marrom/40 px-5 py-2 text-sm font-semibold text-vc-marrom transition hover:bg-vc-bege/40"
      >
        Cancelar
      </button>
    );
  }

  return (
    <form action={acao} className="mt-3 space-y-3 rounded-2xl bg-vc-bege/30 p-4">
      <input type="hidden" name="atendimento_id" value={atendimentoId} />

      <p
        className={`text-sm ${gratuito ? "text-vc-verde" : "font-semibold text-vc-marrom"}`}
        role="status"
      >
        {avisoTaxa}
      </p>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-vc-texto/80">
          Por que está cancelando?
        </span>
        <textarea
          name="motivo"
          required
          rows={2}
          placeholder="Ex.: a consulta foi remarcada pela clínica."
          className="w-full rounded-xl border border-vc-bege-escuro bg-vc-creme px-3 py-2 text-base text-vc-texto outline-none focus:border-vc-verde"
        />
      </label>

      {estado.erro && <p className="text-sm text-vc-marrom">{estado.erro}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Confirmar />
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="w-full rounded-full border border-vc-bege-escuro px-5 py-3 text-sm font-semibold text-vc-texto/80 transition hover:bg-vc-bege/40"
        >
          Manter a visita
        </button>
      </div>
    </form>
  );
}
