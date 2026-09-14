"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  criarCobranca,
  type Estado,
} from "@/app/(painel)/_lib/acoes-comercial";
import { Alerta, Button, Input, Select } from "./ui";

const INICIAL: Estado = {};

function Submeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando…" : "Criar cobrança"}
    </Button>
  );
}

export default function FormCobranca({
  clientes,
  pacotes,
  atendimentos,
}: {
  clientes: { id: string; nome: string }[];
  pacotes: { id: string; cliente_id: string; rotulo: string }[];
  atendimentos: { id: string; cliente_id: string; rotulo: string }[];
}) {
  const [estado, acao] = useActionState(criarCobranca, INICIAL);
  const [clienteId, setClienteId] = useState("");
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button type="button" variante="primario" onClick={() => setAberto(true)}>
        + Nova cobrança
      </Button>
    );
  }

  return (
    <form action={acao} noValidate>
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <Select
        id="cliente_id"
        name="cliente_id"
        label="Cliente"
        required
        value={clienteId}
        onChange={(e) => setClienteId(e.target.value)}
      >
        <option value="">Escolha…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Select>

      <Select id="pacote_id" name="pacote_id" label="Referente a um pacote">
        <option value="">Nenhum</option>
        {pacotes
          .filter((p) => p.cliente_id === clienteId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
      </Select>

      <Select
        id="atendimento_id"
        name="atendimento_id"
        label="Referente a um atendimento"
      >
        <option value="">Nenhum</option>
        {atendimentos
          .filter((a) => a.cliente_id === clienteId)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.rotulo}
            </option>
          ))}
      </Select>

      <div className="grid gap-x-4 sm:grid-cols-3">
        <Input
          id="valor"
          name="valor"
          label="Valor (R$)"
          required
          inputMode="decimal"
          placeholder="150,00"
        />
        <Select id="meio" name="meio" label="Meio" defaultValue="pix">
          <option value="pix">PIX</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="cartao">Cartão</option>
          <option value="transferencia">Transferência</option>
        </Select>
        <Input
          id="vencimento"
          name="vencimento"
          type="date"
          label="Vencimento"
        />
      </div>

      <Input id="descricao" name="descricao" label="Descrição" />

      <label className="mb-4 flex items-center gap-2 text-sm text-vc-texto/80">
        <input
          type="checkbox"
          name="gerar_asaas"
          defaultChecked
          className="size-4 accent-vc-verde"
        />
        Gerar PIX no Asaas (QR + copia-e-cola) — só para o meio PIX
      </label>

      <div className="flex gap-2">
        <Submeter />
        <Button
          type="button"
          variante="fantasma"
          onClick={() => setAberto(false)}
        >
          Fechar
        </Button>
      </div>
    </form>
  );
}
