/**
 * Puerta de entrada.
 *
 * Es la única pantalla que ve alguien antes de tener sesión, así que es la que
 * carga la identidad: fondo oscuro, el monograma y el acento lima. Adentro, la
 * tarjeta clara con el formulario, que es donde hay que mirar.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="zona-oscura relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-nav px-4 py-10">
      {/* Halo de marca. Decorativo: no aporta información. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full opacity-[0.13] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--jc-nav-accent) 0%, transparent 62%)' }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jc-monograma.png" alt="JC" className="h-8 w-auto" />
          <p className="titulo-display mt-2.5 text-2xl text-nav-text-strong">Influencers</p>
          <p className="mt-1.5 text-sm leading-relaxed text-nav-text">
            Gestión de campañas de marketing de influencers
          </p>
        </div>

        <main id="contenido">{children}</main>

        <p className="mt-6 text-center text-xs text-nav-text-2">
          El acceso lo habilita la agencia. No hay registro público.
        </p>
      </div>
    </div>
  )
}
