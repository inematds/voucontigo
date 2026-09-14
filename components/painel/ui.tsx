import * as React from "react";
import Link from "next/link";
import type { StatusAtendimento, StatusPagamento } from "@/lib/domain/types";

export function cn(...partes: Array<string | false | null | undefined>) {
  return partes.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type Variante = "primario" | "secundario" | "perigo" | "fantasma";
type Tamanho = "md" | "lg" | "sm";

const VARIANTE: Record<Variante, string> = {
  primario:
    "bg-vc-verde text-vc-creme hover:bg-vc-verde-claro focus-visible:outline-vc-verde",
  secundario:
    "bg-vc-bege text-vc-texto hover:bg-vc-bege-escuro focus-visible:outline-vc-marrom",
  perigo:
    "bg-vc-marrom text-vc-creme hover:opacity-90 focus-visible:outline-vc-marrom",
  fantasma:
    "bg-transparent text-vc-texto border border-vc-bege-escuro hover:bg-vc-bege/50",
};

const TAMANHO: Record<Tamanho, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-14 px-6 text-lg",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export function Button({
  variante = "primario",
  tamanho = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
}) {
  return (
    <button
      {...props}
      className={cn(BASE, VARIANTE[variante], TAMANHO[tamanho], className)}
    />
  );
}

export function LinkButton({
  variante = "secundario",
  tamanho = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & {
  variante?: Variante;
  tamanho?: Tamanho;
}) {
  return (
    <Link
      {...props}
      className={cn(BASE, VARIANTE[variante], TAMANHO[tamanho], className)}
    />
  );
}

export function AnchorButton({
  variante = "secundario",
  tamanho = "md",
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
}) {
  return (
    <a
      {...props}
      className={cn(BASE, VARIANTE[variante], TAMANHO[tamanho], className)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Campos                                                                      */
/* -------------------------------------------------------------------------- */

const CAMPO =
  "w-full min-h-11 rounded-xl border border-vc-bege-escuro bg-white px-3 py-2 text-base text-vc-texto placeholder:text-vc-texto/40 focus:border-vc-verde focus:outline-none focus:ring-2 focus:ring-vc-verde/30";

export function Label({
  htmlFor,
  children,
  obrigatorio,
}: {
  htmlFor: string;
  children: React.ReactNode;
  obrigatorio?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-sm font-semibold text-vc-texto/80"
    >
      {children}
      {obrigatorio ? <span className="text-vc-marrom"> *</span> : null}
    </label>
  );
}

export function Input({
  label,
  id,
  dica,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  id: string;
  dica?: string;
}) {
  return (
    <div className="mb-4">
      {label ? (
        <Label htmlFor={id} obrigatorio={props.required}>
          {label}
        </Label>
      ) : null}
      <input id={id} {...props} className={cn(CAMPO, className)} />
      {dica ? <p className="mt-1 text-xs text-vc-texto/60">{dica}</p> : null}
    </div>
  );
}

export function Textarea({
  label,
  id,
  dica,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  id: string;
  dica?: string;
}) {
  return (
    <div className="mb-4">
      {label ? (
        <Label htmlFor={id} obrigatorio={props.required}>
          {label}
        </Label>
      ) : null}
      <textarea
        id={id}
        rows={props.rows ?? 4}
        {...props}
        className={cn(CAMPO, "min-h-24 leading-relaxed", className)}
      />
      {dica ? <p className="mt-1 text-xs text-vc-texto/60">{dica}</p> : null}
    </div>
  );
}

export function Select({
  label,
  id,
  dica,
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  id: string;
  dica?: string;
}) {
  return (
    <div className="mb-4">
      {label ? (
        <Label htmlFor={id} obrigatorio={props.required}>
          {label}
        </Label>
      ) : null}
      <select id={id} {...props} className={cn(CAMPO, className)}>
        {children}
      </select>
      {dica ? <p className="mt-1 text-xs text-vc-texto/60">{dica}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card / títulos                                                              */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  titulo,
  acao,
}: {
  children: React.ReactNode;
  className?: string;
  titulo?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-vc-bege-escuro/60 bg-white/80 p-4 shadow-sm",
        className,
      )}
    >
      {titulo ? (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold text-vc-verde">
            {titulo}
          </h2>
          {acao}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl font-bold text-vc-verde">
          {titulo}
        </h1>
        {subtitulo ? (
          <p className="mt-1 text-sm text-vc-texto/70">{subtitulo}</p>
        ) : null}
      </div>
      {acao}
    </header>
  );
}

export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-vc-bege-escuro bg-vc-bege/20 px-4 py-10 text-center">
      <p className="font-semibold text-vc-texto">{titulo}</p>
      {descricao ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-vc-texto/70">
          {descricao}
        </p>
      ) : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

export function Alerta({
  tom = "aviso",
  children,
}: {
  tom?: "aviso" | "erro" | "ok";
  children: React.ReactNode;
}) {
  const tons = {
    aviso: "border-vc-marrom/40 bg-vc-bege/60 text-vc-texto",
    erro: "border-red-300 bg-red-50 text-red-800",
    ok: "border-vc-verde/40 bg-vc-verde/10 text-vc-verde",
  } as const;
  return (
    <p
      role="status"
      className={cn("mb-4 rounded-xl border px-3 py-2 text-sm", tons[tom])}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

export const CORES_STATUS: Record<StatusAtendimento, string> = {
  solicitado: "bg-amber-100 text-amber-900 border-amber-300",
  agendado: "bg-sky-100 text-sky-900 border-sky-300",
  confirmado: "bg-emerald-100 text-emerald-900 border-emerald-300",
  em_andamento: "bg-vc-verde text-vc-creme border-vc-verde",
  concluido: "bg-vc-bege text-vc-texto border-vc-bege-escuro",
  relatado: "bg-vc-verde/15 text-vc-verde border-vc-verde/40",
  cancelado_cliente: "bg-stone-200 text-stone-700 border-stone-300",
  cancelado_operacao: "bg-stone-200 text-stone-700 border-stone-300",
  nao_compareceu: "bg-red-100 text-red-800 border-red-300",
};

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        className ?? "border-vc-bege-escuro bg-vc-bege text-vc-texto",
      )}
    >
      {children}
    </span>
  );
}

export function BadgeStatus({ status }: { status: StatusAtendimento }) {
  const LABEL: Record<StatusAtendimento, string> = {
    solicitado: "Solicitado",
    agendado: "Agendado",
    confirmado: "Confirmado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    relatado: "Relatório enviado",
    cancelado_cliente: "Cancelado (cliente)",
    cancelado_operacao: "Cancelado (operação)",
    nao_compareceu: "Não compareceu",
  };
  return <Badge className={CORES_STATUS[status]}>{LABEL[status]}</Badge>;
}

export function BadgePagamento({ status }: { status: StatusPagamento }) {
  const cores: Record<StatusPagamento, string> = {
    pendente: "bg-amber-100 text-amber-900 border-amber-300",
    pago: "bg-emerald-100 text-emerald-900 border-emerald-300",
    cancelado: "bg-stone-200 text-stone-700 border-stone-300",
  };
  const label: Record<StatusPagamento, string> = {
    pendente: "Pendente",
    pago: "Pago",
    cancelado: "Cancelado",
  };
  return <Badge className={cores[status]}>{label[status]}</Badge>;
}

/* -------------------------------------------------------------------------- */
/* Barra de progresso                                                          */
/* -------------------------------------------------------------------------- */

export function Barra({
  valor,
  total,
  alerta,
}: {
  valor: number;
  total: number;
  alerta?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-vc-bege"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          alerta ? "bg-vc-marrom" : "bg-vc-verde",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Metrica({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: string;
}) {
  return (
    <div className="rounded-2xl border border-vc-bege-escuro/60 bg-white/80 p-4">
      <p className="text-xs font-semibold tracking-wide text-vc-texto/60 uppercase">
        {rotulo}
      </p>
      <p className="mt-1 font-serif text-2xl font-bold text-vc-verde">
        {valor}
      </p>
      {detalhe ? (
        <p className="mt-0.5 text-xs text-vc-texto/60">{detalhe}</p>
      ) : null}
    </div>
  );
}
