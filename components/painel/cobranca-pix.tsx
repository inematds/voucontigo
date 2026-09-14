"use client";

import { useState } from "react";
import { Button } from "./ui";
import BotaoCopiar from "./botao-copiar";
import {
  enviarCobrancaAsaas,
  gerarPixAsaas,
} from "@/app/(painel)/_lib/acoes-comercial";

export type DadosPix = {
  id: string;
  asaas_id: string | null;
  pix_qrcode_base64: string | null;
  pix_copia_cola: string | null;
  link_pagamento: string | null;
  status: string;
};

/**
 * Cartão da cobrança PIX gerada no Asaas: QR, copia-e-cola, link e envio.
 * Sem `asaas_id` mostra só o botão "Gerar PIX (Asaas)".
 */
export default function CobrancaPix({ pagamento }: { pagamento: DadosPix }) {
  const [aberto, setAberto] = useState(false);

  if (!pagamento.asaas_id) {
    if (pagamento.status !== "pendente") return null;
    return (
      <form action={gerarPixAsaas}>
        <input type="hidden" name="id" value={pagamento.id} />
        <Button type="submit" tamanho="sm" variante="secundario">
          Gerar PIX (Asaas)
        </Button>
      </form>
    );
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-vc-bege-escuro bg-vc-creme/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-vc-texto/60">
          PIX Asaas ·{" "}
          {pagamento.status === "pago"
            ? "confirmado"
            : pagamento.status === "cancelado"
              ? "cancelado"
              : "aguardando pagamento"}
        </p>
        <Button
          type="button"
          tamanho="sm"
          variante="fantasma"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? "Esconder QR" : "Ver QR"}
        </Button>
      </div>

      {aberto && pagamento.pix_qrcode_base64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${pagamento.pix_qrcode_base64}`}
          alt="QR Code do PIX"
          width={200}
          height={200}
          className="mt-3 rounded-lg border border-vc-bege-escuro bg-white"
        />
      ) : null}

      {pagamento.pix_copia_cola ? (
        <p className="mt-3 break-all rounded-lg bg-white p-2 font-mono text-[11px] leading-relaxed text-vc-texto/70">
          {pagamento.pix_copia_cola}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {pagamento.pix_copia_cola ? (
          <BotaoCopiar texto={pagamento.pix_copia_cola} rotulo="Copiar copia-e-cola" />
        ) : null}
        {pagamento.link_pagamento ? (
          <a
            href={pagamento.link_pagamento}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl border border-vc-bege-escuro px-3 py-1.5 text-sm font-semibold text-vc-texto/80 hover:bg-white"
          >
            Abrir fatura ↗
          </a>
        ) : null}

        {pagamento.status === "pendente" ? (
          <>
            <form action={enviarCobrancaAsaas}>
              <input type="hidden" name="id" value={pagamento.id} />
              <input type="hidden" name="canal" value="whatsapp" />
              <Button type="submit" tamanho="sm" variante="primario">
                Enviar por WhatsApp
              </Button>
            </form>
            <form action={enviarCobrancaAsaas}>
              <input type="hidden" name="id" value={pagamento.id} />
              <input type="hidden" name="canal" value="email" />
              <Button type="submit" tamanho="sm" variante="secundario">
                Enviar por e-mail
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
