import type { CSSProperties, ReactNode } from 'react'
import { googleFontsHref, type ResolvedTheme } from '@/lib/domain/theme'

/**
 * Aplica el tema de un cliente a todo lo que envuelve.
 *
 * Sobrescribe las variables `--jc-*` en un contenedor. Como los tokens de
 * Tailwind salen de esas variables, cambia la interfaz entera sin que ningún
 * componente sepa que existe el concepto de marca.
 */
export function ThemeScope({
  theme,
  children,
  className,
}: {
  theme: ResolvedTheme
  children: ReactNode
  className?: string
}) {
  const fontsHref = googleFontsHref(theme.googleFonts)
  return (
    <>
      {fontsHref ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      ) : null}
      <div
        className={className}
        style={theme.variables as CSSProperties}
        data-theme-mode={theme.mode.toLowerCase()}
      >
        {children}
      </div>
    </>
  )
}
