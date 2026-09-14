"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  cancelarAtendimento,
  type Estado,
} from "@/app/(painel)/_lib/acoes-atendimento";
import { centavosParaReais } from "@/app/(painel)/_lib/dominio-local";
import { Alerta, Button, Select, Textarea } from "./ui";

const INICIAL: Estado = {};

function Submeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variante="perigo" disabled={pending}>
      {pending ? "Cancelando…" : "Confirmar cancelamento"}
    </Button>
  );
}

export default function FormCancelar({
  id,
  taxaEstimadaCentavos,
  horasGratis,
  percentual,
}: {
  id: string;
  taxaEstimadaCentavos: number;
  horasGratis: number;
  percentual: number;
}) {
  const [estado, acao] = useActionState(cancelarAtendimento, INICIAL);

  return (
    <form action={acao} noValidate>
      <input type="hidden" name="id" value={id} />

      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <Alerta tom="aviso">
        Política: grátis até {horasGratis}h antes; depois {percentual}% do valor
        previsto. <strong>Taxa estimada agora: {centavosParaReais(taxaEstimadaCentavos)}</strong>
      </Alerta>

      <Select id="status-cancelamento" name="status" label="Quem cancelou">
        <option value="cancelado_cliente">Cliente</option>
        <option value="cancelado_operacao">Operação (nós)</option>
      </Select>

      <Textarea
        id="motivo_cancelamento"
        name="motivo_cancelamento"
        label="Motivo"
        rows={2}
        required
      />

      <Submeter />
    </form>
  );
}
