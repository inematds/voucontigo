"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  enviarHorariosPorEmail,
  enviarHorariosPorWhatsApp,
  type EstadoAcao,
} from "@/app/(portal)/_lib/acoes";

function Botao({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full border border-vc-verde px-5 py-3 text-sm font-semibold text-vc-verde transition hover:bg-vc-verde hover:text-vc-creme disabled:opacity-60"
    >
      {pending ? "Enviando…" : rotulo}
    </button>
  );
}

export default function EnviarHorarios({ duracaoMin }: { duracaoMin: number }) {
  const [porEmail, acaoEmail] = useActionState<EstadoAcao, FormData>(enviarHorariosPorEmail, {});
  const [porWa, acaoWa] = useActionState<EstadoAcao, FormData>(enviarHorariosPorWhatsApp, {});
  const estado = porEmail.ok || porEmail.erro ? porEmail : porWa;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={acaoEmail} className="flex-1">
          <input type="hidden" name="duracao_min" value={duracaoMin} />
          <Botao rotulo="Receber por e-mail" />
        </form>
        <form action={acaoWa} className="flex-1">
          <input type="hidden" name="duracao_min" value={duracaoMin} />
          <Botao rotulo="Receber por WhatsApp" />
        </form>
      </div>

      {estado.ok && (
        <p className="rounded-2xl bg-vc-verde/10 px-4 py-3 text-sm text-vc-verde">{estado.ok}</p>
      )}
      {estado.erro && (
        <p className="rounded-2xl bg-vc-marrom/10 px-4 py-3 text-sm text-vc-marrom">{estado.erro}</p>
      )}
    </div>
  );
}
