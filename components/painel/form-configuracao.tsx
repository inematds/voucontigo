"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  salvarConfiguracao,
  type Estado,
} from "@/app/(painel)/_lib/acoes-comercial";
import { Alerta, Button, Card, Input, Textarea } from "./ui";

const INICIAL: Estado = {};

type CampoCfg = {
  chave: string;
  rotulo: string;
  dica?: string;
  tipo?: "texto" | "numero" | "area";
};

export const GRUPOS: { titulo: string; campos: CampoCfg[] }[] = [
  {
    titulo: "Valores e regras",
    campos: [
      {
        chave: "valor_hora_centavos",
        rotulo: "Valor da hora (em centavos)",
        dica: "Ex.: 7500 = R$ 75,00",
        tipo: "numero",
      },
      {
        chave: "minimo_horas_avulso",
        rotulo: "Mínimo de horas no avulso",
        tipo: "numero",
      },
      { chave: "raio_km", rotulo: "Raio de atendimento (km)", tipo: "numero" },
      { chave: "cidade_base", rotulo: "Cidade base" },
      {
        chave: "tolerancia_espera_min",
        rotulo: "Tolerância de espera (min)",
        dica: "Minutos de espera que NÃO contam como hora.",
        tipo: "numero",
      },
      {
        chave: "cancelamento_gratis_horas",
        rotulo: "Cancelamento grátis até (horas antes)",
        tipo: "numero",
      },
      {
        chave: "cancelamento_taxa_percentual",
        rotulo: "Taxa de cancelamento (%)",
        tipo: "numero",
      },
      {
        chave: "saldo_baixo_horas",
        rotulo: "Alerta de saldo baixo (horas)",
        tipo: "numero",
      },
    ],
  },
  {
    titulo: "Canais",
    campos: [
      { chave: "chave_pix", rotulo: "Chave PIX" },
      {
        chave: "whatsapp_empresa",
        rotulo: "WhatsApp da empresa",
        dica: "Com DDI e DDD, só números.",
      },
      {
        chave: "telegram_chat_gestao",
        rotulo: "Chat ID do grupo de gestão (Telegram)",
      },
    ],
  },
  {
    titulo: "Templates de WhatsApp",
    campos: [
      { chave: "template_resposta_lead", rotulo: "Resposta a lead", tipo: "area" },
      { chave: "template_confirmacao", rotulo: "Confirmação", tipo: "area" },
      { chave: "template_lembrete_d1", rotulo: "Lembrete D-1", tipo: "area" },
      { chave: "template_lembrete_2h", rotulo: "Lembrete 2h antes", tipo: "area" },
      { chave: "template_relatorio", rotulo: "Relatório", tipo: "area" },
      { chave: "template_saldo_baixo", rotulo: "Saldo baixo", tipo: "area" },
      { chave: "template_cobranca_pix", rotulo: "Cobrança PIX", tipo: "area" },
    ],
  },
];

function Submeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="lg" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : "Salvar configurações"}
    </Button>
  );
}

export default function FormConfiguracao({
  valores,
}: {
  valores: Record<string, string>;
}) {
  const [estado, acao] = useActionState(salvarConfiguracao, INICIAL);

  return (
    <form action={acao} noValidate className="space-y-5">
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      {GRUPOS.map((g) => (
        <Card key={g.titulo} titulo={g.titulo}>
          {g.campos.map((c) =>
            c.tipo === "area" ? (
              <Textarea
                key={c.chave}
                id={`cfg-${c.chave}`}
                name={`cfg__${c.chave}`}
                label={c.rotulo}
                dica={c.dica ?? "Use {chaves} para os valores dinâmicos."}
                rows={4}
                defaultValue={valores[c.chave] ?? ""}
              />
            ) : (
              <Input
                key={c.chave}
                id={`cfg-${c.chave}`}
                name={`cfg__${c.chave}`}
                label={c.rotulo}
                dica={c.dica}
                inputMode={c.tipo === "numero" ? "numeric" : undefined}
                defaultValue={valores[c.chave] ?? ""}
              />
            ),
          )}
        </Card>
      ))}

      <Submeter />
    </form>
  );
}
