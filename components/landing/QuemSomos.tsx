export function QuemSomos() {
  return (
    <section id="quem-somos" className="bg-vc-bege/35 py-14 sm:py-20">
      <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 sm:grid-cols-[minmax(0,260px)_1fr]">
        {/* Placeholder da foto da acompanhante — trocar por <Image src="/acompanhante.jpg" /> */}
        <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-3xl border border-dashed border-vc-marrom/40 bg-vc-creme text-center">
          <span className="px-6 text-sm text-vc-marrom/70">
            Espaço para a foto
            <br />
            da acompanhante
          </span>
        </div>

        <div>
          <h2 className="font-serif text-2xl text-vc-verde sm:text-3xl">
            Quem vai estar junto
          </h2>
          <p className="mt-4 text-vc-texto/80">
            O Vou Contigo nasceu dentro de uma família, da vontade de resolver
            algo que quase todo mundo vive: alguém que a gente ama precisa sair,
            e não dá para estar em dois lugares ao mesmo tempo.
          </p>
          <p className="mt-4 text-vc-texto/80">
            Quem acompanha é sempre a mesma pessoa de confiança, apresentada a
            você antes do primeiro compromisso. Presença calma, sem pressa, que
            conversa, ajuda a carregar, organiza a fila, lembra o endereço de
            volta — e depois conta para você como foi.
          </p>
          <p className="mt-4 font-serif text-lg italic text-vc-marrom">
            A gente não substitui a família. A gente fica junto quando ela não
            pode.
          </p>
        </div>
      </div>
    </section>
  );
}
