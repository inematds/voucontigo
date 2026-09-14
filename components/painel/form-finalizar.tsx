"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  finalizarAtendimento,
  type Estado,
} from "@/app/(painel)/_lib/acoes-atendimento";
import { Alerta, Button, Input, Textarea, cn } from "./ui";

const INICIAL: Estado = {};

function BotaoFinalizar() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      tamanho="lg"
      variante="perigo"
      className="w-full"
      disabled={pending}
    >
      {pending ? "Finalizando…" : "FINALIZAR ATENDIMENTO"}
    </Button>
  );
}

const ESFORCO = [
  { v: 1, rotulo: "Muito leve" },
  { v: 2, rotulo: "Leve" },
  { v: 3, rotulo: "Normal" },
  { v: 4, rotulo: "Puxado" },
  { v: 5, rotulo: "Muito puxado" },
];

export default function FormFinalizar({ id }: { id: string }) {
  const [estado, acao] = useActionState(finalizarAtendimento, INICIAL);
  const [esforco, setEsforco] = useState<number | null>(null);

  return (
    <form action={acao} noValidate>
      <input type="hidden" name="id" value={id} />

      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input
          id="minutos_espera"
          name="minutos_espera"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          label="Minutos de espera"
          required
          dica="Tempo parado esperando (consulta, exame, fila)."
        />
        <Input
          id="km_rodados"
          name="km_rodados"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          label="Km rodados"
          required
        />
        <Input
          id="custo_estacionamento"
          name="custo_estacionamento"
          type="text"
          inputMode="decimal"
          label="Estacionamento (R$)"
          placeholder="0,00"
        />
        <Input
          id="custo_pedagio"
          name="custo_pedagio"
          type="text"
          inputMode="decimal"
          label="Pedágio (R$)"
          placeholder="0,00"
        />
        <Input
          id="custo_outros"
          name="custo_outros"
          type="text"
          inputMode="decimal"
          label="Outros custos (R$)"
          placeholder="0,00"
        />
      </div>

      <fieldset className="mb-4">
        <legend className="mb-2 block text-sm font-semibold text-vc-texto/80">
          Nível de esforço <span className="text-vc-marrom">*</span>
        </legend>
        <input type="hidden" name="nivel_esforco" value={esforco ?? ""} />
        <div className="grid grid-cols-5 gap-2">
          {ESFORCO.map((e) => (
            <button
              key={e.v}
              type="button"
              aria-pressed={esforco === e.v}
              onClick={() => setEsforco(e.v)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-1 text-xs font-semibold transition-colors",
                esforco === e.v
                  ? "border-vc-verde bg-vc-verde text-vc-creme"
                  : "border-vc-bege-escuro bg-white text-vc-texto/70",
              )}
            >
              <span className="text-lg">{e.v}</span>
              <span className="leading-tight">{e.rotulo}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Textarea
        id="observacoes_internas"
        name="observacoes_internas"
        label="Observações internas"
        dica="Só a equipe vê. Não entra no relatório da família."
        rows={3}
      />

      <p className="mb-3 text-xs text-vc-texto/60">
        Ao finalizar gravamos o horário de agora como fim real e debitamos as
        horas do pacote (se houver).
      </p>

      <BotaoFinalizar />
    </form>
  );
}
