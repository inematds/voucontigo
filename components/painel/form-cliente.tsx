"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  criarCliente,
  editarCliente,
  type Estado,
} from "@/app/(painel)/_lib/acoes-cadastro";
import { Alerta, Button, Input, Select, Textarea } from "./ui";
import type { OrigemLead } from "@/lib/domain/types";

const INICIAL: Estado = {};

const ORIGEM_LABEL: Record<OrigemLead, string> = {
  landing: "Site / landing",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  clinica: "Clínica parceira",
  outro: "Outro",
};

function Submeter({ novo }: { novo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="lg" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : novo ? "Cadastrar cliente" : "Salvar alterações"}
    </Button>
  );
}

export type ValoresCliente = {
  id?: string;
  nome?: string;
  whatsapp?: string;
  email?: string | null;
  cpf?: string | null;
  endereco_cobranca?: string | null;
  origem?: OrigemLead;
  observacoes?: string | null;
  consentimento_lgpd_em?: string | null;
};

export default function FormCliente({
  valores = {},
}: {
  valores?: ValoresCliente;
}) {
  const novo = !valores.id;
  const [estado, acao] = useActionState(
    novo ? criarCliente : editarCliente,
    INICIAL,
  );

  return (
    <form action={acao} noValidate>
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}
      <input
        type="hidden"
        name="consentimento_atual"
        value={valores.consentimento_lgpd_em ?? ""}
      />

      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <Input
        id="nome"
        name="nome"
        label="Nome do cliente (quem contrata)"
        required
        defaultValue={valores.nome ?? ""}
      />
      <Input
        id="whatsapp"
        name="whatsapp"
        label="WhatsApp"
        required
        inputMode="tel"
        placeholder="5551999998888"
        dica="Com DDI e DDD, só números."
        defaultValue={valores.whatsapp ?? ""}
      />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input
          id="email"
          name="email"
          type="email"
          label="E-mail"
          inputMode="email"
          defaultValue={valores.email ?? ""}
        />
        <Input
          id="cpf"
          name="cpf"
          label="CPF"
          inputMode="numeric"
          defaultValue={valores.cpf ?? ""}
        />
      </div>

      <Input
        id="endereco_cobranca"
        name="endereco_cobranca"
        label="Endereço de cobrança"
        defaultValue={valores.endereco_cobranca ?? ""}
      />

      <Select
        id="origem"
        name="origem"
        label="Como chegou até nós"
        defaultValue={valores.origem ?? "landing"}
      >
        {(Object.keys(ORIGEM_LABEL) as OrigemLead[]).map((o) => (
          <option key={o} value={o}>
            {ORIGEM_LABEL[o]}
          </option>
        ))}
      </Select>

      <Textarea
        id="observacoes"
        name="observacoes"
        label="Observações"
        rows={3}
        defaultValue={valores.observacoes ?? ""}
      />

      <div className="mb-5 rounded-xl border border-vc-bege-escuro bg-vc-bege/30 p-3">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consentimento_lgpd"
            defaultChecked={Boolean(valores.consentimento_lgpd_em)}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--vc-verde)]"
          />
          <span>
            O cliente autorizou o uso dos dados pessoais dele e da pessoa
            acompanhada para a prestação do serviço (LGPD). Não registramos
            medicação, diagnóstico nem prontuário.
          </span>
        </label>
        {valores.consentimento_lgpd_em ? (
          <p className="mt-2 text-xs text-vc-texto/60">
            Consentimento registrado em{" "}
            {new Date(valores.consentimento_lgpd_em).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
            .
          </p>
        ) : null}
      </div>

      <Submeter novo={novo} />
    </form>
  );
}
