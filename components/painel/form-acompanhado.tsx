"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  salvarAcompanhado,
  type Estado,
} from "@/app/(painel)/_lib/acoes-cadastro";
import { Alerta, Button, Input, Select, Textarea } from "./ui";
import { MOBILIDADE_LABEL } from "@/lib/domain/types";
import type { Mobilidade } from "@/lib/domain/types";

const INICIAL: Estado = {};

export type ValoresAcompanhado = {
  id?: string;
  nome?: string;
  apelido?: string | null;
  data_nascimento?: string | null;
  endereco?: string;
  telefone?: string | null;
  contato_emergencia_nome?: string | null;
  contato_emergencia_telefone?: string | null;
  mobilidade?: Mobilidade;
  preferencias?: string | null;
  restricoes_declaradas?: string | null;
};

function Submeter({ novo }: { novo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : novo ? "Cadastrar" : "Salvar"}
    </Button>
  );
}

export default function FormAcompanhado({
  clienteId,
  valores = {},
  aberto = false,
}: {
  clienteId: string;
  valores?: ValoresAcompanhado;
  aberto?: boolean;
}) {
  const novo = !valores.id;
  const [mostrar, setMostrar] = useState(aberto);
  const [estado, acao] = useActionState(salvarAcompanhado, INICIAL);

  if (!mostrar) {
    return (
      <Button
        type="button"
        variante="fantasma"
        tamanho="sm"
        onClick={() => setMostrar(true)}
      >
        {novo ? "+ Cadastrar acompanhado(a)" : "Editar ficha"}
      </Button>
    );
  }

  return (
    <form action={acao} noValidate className="mt-2">
      <input type="hidden" name="cliente_id" value={clienteId} />
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input
          id={`nome-${valores.id ?? "novo"}`}
          name="nome"
          label="Nome completo"
          required
          defaultValue={valores.nome ?? ""}
        />
        <Input
          id={`apelido-${valores.id ?? "novo"}`}
          name="apelido"
          label="Como gosta de ser chamada(o)"
          defaultValue={valores.apelido ?? ""}
        />
        <Input
          id={`nasc-${valores.id ?? "novo"}`}
          name="data_nascimento"
          type="date"
          label="Data de nascimento"
          defaultValue={valores.data_nascimento ?? ""}
        />
        <Input
          id={`tel-${valores.id ?? "novo"}`}
          name="telefone"
          label="Telefone"
          inputMode="tel"
          defaultValue={valores.telefone ?? ""}
        />
      </div>

      <Input
        id={`end-${valores.id ?? "novo"}`}
        name="endereco"
        label="Endereço"
        required
        defaultValue={valores.endereco ?? ""}
      />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input
          id={`emerg-nome-${valores.id ?? "novo"}`}
          name="contato_emergencia_nome"
          label="Contato de emergência — nome"
          defaultValue={valores.contato_emergencia_nome ?? ""}
        />
        <Input
          id={`emerg-tel-${valores.id ?? "novo"}`}
          name="contato_emergencia_telefone"
          label="Contato de emergência — telefone"
          inputMode="tel"
          defaultValue={valores.contato_emergencia_telefone ?? ""}
        />
      </div>

      <Select
        id={`mob-${valores.id ?? "novo"}`}
        name="mobilidade"
        label="Mobilidade"
        defaultValue={valores.mobilidade ?? "anda_sozinho"}
      >
        {(Object.keys(MOBILIDADE_LABEL) as Mobilidade[]).map((m) => (
          <option key={m} value={m}>
            {MOBILIDADE_LABEL[m]}
          </option>
        ))}
      </Select>

      <Textarea
        id={`pref-${valores.id ?? "novo"}`}
        name="preferencias"
        label="Preferências"
        dica="Ex.: gosta de conversar, não gosta de pressa, prefere sair cedo."
        rows={2}
        defaultValue={valores.preferencias ?? ""}
      />

      <Textarea
        id={`restr-${valores.id ?? "novo"}`}
        name="restricoes_declaradas"
        label="Restrições declaradas"
        dica="Só o mínimo necessário para o acompanhamento. NÃO registramos medicação, diagnóstico ou prontuário."
        rows={2}
        defaultValue={valores.restricoes_declaradas ?? ""}
      />

      <div className="flex gap-2">
        <Submeter novo={novo} />
        <Button
          type="button"
          variante="fantasma"
          onClick={() => setMostrar(false)}
        >
          Fechar
        </Button>
      </div>
    </form>
  );
}
