"use client";

export default function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-vc-verde px-6 py-3 text-sm font-semibold text-vc-creme transition hover:bg-vc-verde-claro print:hidden"
    >
      Imprimir / salvar PDF
    </button>
  );
}
