export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold tracking-tight text-ink-900">JC Influencers</p>
          <p className="text-sm text-ink-500">Gestión de campañas de marketing de influencers</p>
        </div>
        <main id="contenido">{children}</main>
        <p className="mt-6 text-center text-xs text-ink-400">
          El acceso lo habilita la agencia. No hay registro público.
        </p>
      </div>
    </div>
  )
}
