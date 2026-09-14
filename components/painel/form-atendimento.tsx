"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  criarAtendimento,
  editarAtendimento,
  verificarRaioDestino,
  type Estado,
} from "@/app/(painel)/_lib/acoes-atendimento";
import { Alerta, Button, Input, Select, Textarea } from "./ui";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import type { TipoAtendimento } from "@/lib/domain/types";

const INICIAL: Estado = {};

export type OpcaoCliente = { id: string; nome: string };
export type OpcaoAcompanhado = { id: string; cliente_id: string; nome: string };
export type OpcaoPacote = {
  id: string;
  cliente_id: string;
  rotulo: string;
};
export type OpcaoAcompanhante = { id: string; nome: string };

export type ValoresAtendimento = {
  id?: string;
  cliente_id?: string;
  acompanhado_id?: string;
  acompanhante_id?: string | null;
  pacote_id?: string | null;
  tipo?: TipoAtendimento;
  descricao?: string | null;
  endereco_saida?: string;
  endereco_destino?: string;
  data?: string;
  hora_prevista_inicio?: string;
  duracao_prevista_min?: number;
};

function Submeter({ novo }: { novo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="lg" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : novo ? "Agendar atendimento" : "Salvar alterações"}
    </Button>
  );
}

export default function FormAtendimento({
  clientes,
  acompanhados,
  pacotes,
  acompanhantes,
  valores = {},
}: {
  clientes: OpcaoCliente[];
  acompanhados: OpcaoAcompanhado[];
  pacotes: OpcaoPacote[];
  acompanhantes: OpcaoAcompanhante[];
  valores?: ValoresAtendimento;
}) {
  const novo = !valores.id;
  const [estado, acao] = useActionState(
    novo ? criarAtendimento : editarAtendimento,
    INICIAL,
  );
  const [clienteId, setClienteId] = useState(valores.cliente_id ?? "");
  const [raio, setRaio] = useState<{ dentro: boolean | null; aviso: string } | null>(
    null,
  );

  async function conferirRaio(endereco: string) {
    const limpo = endereco.trim();
    if (limpo.length < 3) {
      setRaio(null);
      return;
    }
    try {
      const r = await verificarRaioDestino(limpo);
      setRaio(r.aviso ? { dentro: r.dentro, aviso: r.aviso } : null);
    } catch {
      setRaio(null);
    }
  }

  const acompanhadosDoCliente = acompanhados.filter(
    (a) => a.cliente_id === clienteId,
  );
  const pacotesDoCliente = pacotes.filter((p) => p.cliente_id === clienteId);

  return (
    <form action={acao} noValidate>
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}

      <Select
        id="cliente_id"
        name="cliente_id"
        label="Cliente (quem contrata)"
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

      <Select
        id="acompanhado_id"
        name="acompanhado_id"
        label="Quem será acompanhado"
        required
        defaultValue={valores.acompanhado_id ?? ""}
        disabled={!clienteId}
        dica={
          clienteId && acompanhadosDoCliente.length === 0
            ? "Este cliente ainda não tem acompanhado cadastrado."
            : undefined
        }
      >
        <option value="">Escolha…</option>
        {acompanhadosDoCliente.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </Select>

      <Select
        id="tipo"
        name="tipo"
        label="Tipo de compromisso"
        required
        defaultValue={valores.tipo ?? "consulta"}
      >
        {(
          Object.keys(TIPO_ATENDIMENTO_LABEL) as TipoAtendimento[]
        ).map((t) => (
          <option key={t} value={t}>
            {TIPO_ATENDIMENTO_LABEL[t]}
          </option>
        ))}
      </Select>

      <div className="grid gap-x-4 sm:grid-cols-3">
        <Input
          id="data"
          name="data"
          type="date"
          label="Data"
          required
          defaultValue={valores.data ?? ""}
        />
        <Input
          id="hora_prevista_inicio"
          name="hora_prevista_inicio"
          type="time"
          label="Hora prevista"
          required
          defaultValue={(valores.hora_prevista_inicio ?? "").slice(0, 5)}
        />
        <Input
          id="duracao_prevista_min"
          name="duracao_prevista_min"
          type="number"
          min={15}
          step={15}
          inputMode="numeric"
          label="Duração prevista (min)"
          required
          defaultValue={valores.duracao_prevista_min ?? 120}
        />
      </div>

      <Input
        id="endereco_saida"
        name="endereco_saida"
        label="Endereço de saída"
        required
        defaultValue={valores.endereco_saida ?? ""}
      />
      <Input
        id="endereco_destino"
        name="endereco_destino"
        label="Endereço de destino"
        required
        defaultValue={valores.endereco_destino ?? ""}
        onBlur={(e) => conferirRaio(e.target.value)}
      />
      {raio ? (
        <Alerta tom={raio.dentro === false ? "aviso" : "ok"}>
          {raio.aviso}
          {raio.dentro === false
            ? " Você pode agendar assim mesmo — só combine o deslocamento extra."
            : ""}
        </Alerta>
      ) : null}

      <Textarea
        id="descricao"
        name="descricao"
        label="Descrição / combinados"
        rows={3}
        defaultValue={valores.descricao ?? ""}
      />

      <Select
        id="acompanhante_id"
        name="acompanhante_id"
        label="Acompanhante"
        defaultValue={valores.acompanhante_id ?? ""}
      >
        <option value="">A definir</option>
        {acompanhantes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </Select>

      <Select
        id="pacote_id"
        name="pacote_id"
        label="Pacote a debitar"
        defaultValue={valores.pacote_id ?? ""}
        dica="Sem pacote, o atendimento é cobrado como avulso."
      >
        <option value="">Nenhum (avulso)</option>
        {pacotesDoCliente.map((p) => (
          <option key={p.id} value={p.id}>
            {p.rotulo}
          </option>
        ))}
      </Select>

      <Submeter novo={novo} />
    </form>
  );
}
