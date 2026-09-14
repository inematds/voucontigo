"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

export type ItemNav = { href: string; rotulo: string; icone: string };

export const ITENS_PRINCIPAIS: ItemNav[] = [
  { href: "/painel", rotulo: "Hoje", icone: "☀️" },
  { href: "/painel/agenda", rotulo: "Agenda", icone: "🗓️" },
  { href: "/painel/clientes", rotulo: "Clientes", icone: "👥" },
  { href: "/painel/pacotes", rotulo: "Pacotes", icone: "⏳" },
  { href: "/painel/financeiro", rotulo: "Financeiro", icone: "💰" },
];

export const ITENS_EXTRAS: ItemNav[] = [
  { href: "/painel/leads", rotulo: "Leads", icone: "📥" },
];

export const ITENS_GESTORA: ItemNav[] = [
  { href: "/painel/metricas", rotulo: "Métricas", icone: "📊" },
  { href: "/painel/configuracoes", rotulo: "Configurações", icone: "⚙️" },
];

function ativo(pathname: string, href: string) {
  if (href === "/painel") return pathname === "/painel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BarraInferior({ ehGestora }: { ehGestora: boolean }) {
  const pathname = usePathname();
  const maisAtivo =
    [...ITENS_EXTRAS, ...(ehGestora ? ITENS_GESTORA : [])].some((i) =>
      ativo(pathname, i.href),
    ) || pathname.startsWith("/painel/mais");

  const itens = ITENS_PRINCIPAIS.slice(0, 5);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-vc-bege-escuro bg-vc-creme/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {itens.map((item) => {
          const on = ativo(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold",
                  on ? "text-vc-verde" : "text-vc-texto/60",
                )}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icone}
                </span>
                {item.rotulo}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/painel/mais"
            aria-current={maisAtivo ? "page" : undefined}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold",
              maisAtivo ? "text-vc-verde" : "text-vc-texto/60",
            )}
          >
            <span aria-hidden className="text-lg leading-none">
              ☰
            </span>
            Mais
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export function Sidebar({
  nome,
  ehGestora,
  children,
}: {
  nome: string;
  ehGestora: boolean;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const itens = [
    ...ITENS_PRINCIPAIS,
    ...ITENS_EXTRAS,
    ...(ehGestora ? ITENS_GESTORA : []),
  ];

  return (
    <aside className="hidden w-60 shrink-0 border-r border-vc-bege-escuro bg-vc-bege/30 md:flex md:flex-col">
      <div className="px-5 py-6">
        <p className="font-serif text-xl font-bold text-vc-verde">
          Vou Contigo
        </p>
        <p className="mt-0.5 text-xs text-vc-texto/60">
          {nome} · {ehGestora ? "gestora" : "acompanhante"}
        </p>
      </div>
      <nav aria-label="Navegação lateral" className="flex-1 px-3">
        <ul className="space-y-1">
          {itens.map((item) => {
            const on = ativo(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                    on
                      ? "bg-vc-verde text-vc-creme"
                      : "text-vc-texto/80 hover:bg-vc-bege",
                  )}
                >
                  <span aria-hidden>{item.icone}</span>
                  {item.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-3">{children}</div>
    </aside>
  );
}
