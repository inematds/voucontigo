"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  venderPacote,
  type Estado,
} from "@/app/(painel)/_lib/acoes-comercial";
import { Alerta, Button, Input, Select } from "./ui";

const INICIAL: Estado = {};

function Submeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="lg" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : "Vender pacote"}
    </Button>
  );
}

export default function FormPacote({
  clientes,
  planos,
  clienteInicial,
  validoDe,
  validoAte,
}: {
  clientes: { id: string; nome: string }[];
  planos: { id: string; rotulo: string }[];
  clienteInicial?: string;
  validoDe: string;
  validoAte: string;
}) {
  const [estado, acao] = useActionState(venderPacote, INICIAL);

  return (
    <form action={acao} noValidate>
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}

      <Select
        id="cliente_id"
        name="cliente_id"
        label="Cliente"
        required
        defaultValue={clienteInicial ?? ""}
      >
        <option value="">Escolha…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Select>

      <Select id="plano_id" name="plano_id" label="Plano" required>
        <option value="">Escolha…</option>
        {planos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.rotulo}
          </option>
        ))}
      </Select>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input
          id="valido_de"
          name="valido_de"
          type="date"
          label="Válido de"
          required
          defaultValue={validoDe}
        />
        <Input
          id="valido_ate"
          name="valido_ate"
          type="date"
          label="Válido até"
          required
          defaultValue={validoAte}
          dica="Padrão: 30 dias."
        />
      </div>

      <label className="mb-5 flex items-start gap-3 rounded-xl border border-vc-bege-escuro bg-vc-bege/30 p-3 text-sm">
        <input
          type="checkbox"
          name="gerar_cobranca"
          defaultChecked
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--vc-verde)]"
        />
        Gerar cobrança PIX pendente no financeiro.
      </label>

      <Submeter />
    </form>
  );
}
