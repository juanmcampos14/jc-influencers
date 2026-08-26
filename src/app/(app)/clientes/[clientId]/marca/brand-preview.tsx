"use client"

import type { CSSProperties } from 'react'
import type { ResolvedTheme } from '@/lib/domain/theme'
import { FondoDeMarca } from '@/components/fondo-de-marca'

/**
 * Vista previa del portal del cliente con la identidad aplicada.
 *
 * Usa las MISMAS variables `--jc-*` que el portal real, así que lo que se ve
 * acá es exactamente lo que va a ver el cliente. No es una maqueta aparte que
 * después se desincroniza.
 */
export function BrandPreview({
  theme,
  clientName,
  logoUrl,
  logoIsDark,
  fondoUrl,
  muralUrl,
  fondoOpacidad,
}: {
  theme: ResolvedTheme
  clientName: string
  logoUrl: string | null
  logoIsDark: boolean
  /** Imagen del sitio elegida, o la que ya está guardada. */
  fondoUrl?: string | null
  muralUrl?: string | null
  fondoOpacidad?: number
}) {
  // Misma regla que en el portal: un logo de trazo claro necesita fondo.
  const needsBackdrop = logoUrl !== null && !logoIsDark && theme.mode === 'LIGHT'
  return (
    <div className="rounded-xl border border-ink-200 bg-surface">
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
        <p className="text-sm font-semibold text-ink-900">Así lo ve {clientName}</p>
        <span className="text-xs text-ink-500">{theme.mode === 'DARK' ? 'Modo oscuro' : 'Modo claro'}</span>
      </div>

      <div
        style={
          {
            ...theme.variables,
            backgroundColor: 'var(--jc-bg)',
            color: 'var(--jc-text)',
            fontFamily: 'var(--jc-font-body)',
          } as CSSProperties
        }
        className="relative overflow-hidden rounded-b-xl p-4"
      >
        {/*
          * El MISMO componente que usa el portal, no una imitación. Si el
          * tratamiento de color cambia, cambia en los dos lados a la vez: una
          * previsualización que se desincroniza es peor que no tenerla, porque
          * se aprueba mirando algo que el cliente no va a ver.
          */}
        <FondoDeMarca
          imagenUrl={fondoUrl ?? null}
          muralUrl={muralUrl ?? null}
          opacidad={fondoOpacidad ?? 8}
        />
        <div className="relative z-10">
        {/* Barra lateral */}
        <div className="flex gap-3">
          <aside
            className="hidden w-40 shrink-0 rounded-lg p-3 sm:block"
            style={{ backgroundColor: 'var(--jc-surface)', border: '1px solid var(--jc-border)' }}
          >
            <div className="mb-3 flex h-9 items-center">
              {logoUrl ? (
                <span
                  className="inline-flex items-center rounded-md"
                  style={
                    needsBackdrop
                      ? { backgroundColor: 'var(--jc-primary)', padding: '4px 8px' }
                      : undefined
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="" className="max-h-7 max-w-full object-contain" />
                </span>
              ) : (
                <span className="text-sm font-semibold" style={{ fontFamily: 'var(--jc-font-heading)' }}>
                  {clientName}
                </span>
              )}
            </div>
            <div
              className="mb-1 rounded-md px-2 py-1.5 text-xs font-medium"
              style={{ backgroundColor: 'var(--jc-primary-soft)', color: 'var(--jc-primary)' }}
            >
              Mis campañas
            </div>
            <div className="rounded-md px-2 py-1.5 text-xs" style={{ color: 'var(--jc-muted)' }}>
              Cerrar sesión
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <h3
              className="text-base font-semibold"
              style={{ fontFamily: 'var(--jc-font-heading)', color: 'var(--jc-text)' }}
            >
              Lanzamiento de temporada
            </h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--jc-muted)' }}>
              Perfiles propuestos para revisar y aprobar.
            </p>

            <div
              className="mb-3 p-3"
              style={{
                backgroundColor: 'var(--jc-surface)',
                border: '1px solid var(--jc-border)',
                borderRadius: 'var(--jc-radius)',
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--jc-text)' }}>
                    Valentina Ruiz
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--jc-muted)' }}>
                    ARG · Crypto / Web3 · shortlist #1
                  </p>
                </div>
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: 'var(--jc-primary-soft)', color: 'var(--jc-primary)' }}
                >
                  Pendiente
                </span>
              </div>

              <div
                className="mb-2 grid grid-cols-3 gap-2 p-2 text-center"
                style={{ backgroundColor: 'var(--jc-bg-2)', borderRadius: 'calc(var(--jc-radius) - 4px)' }}
              >
                {[
                  ['Seguidores', '31,6 k'],
                  ['Engagement', '1,5%'],
                  ['Fit', '★★★★★'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px]" style={{ color: 'var(--jc-muted)' }}>
                      {label}
                    </p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--jc-text)' }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mb-2 text-[11px]" style={{ color: 'var(--jc-text-2)' }}>
                Encaja con el cluster principal y con el rango de seguidores del brief.
              </p>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: 'var(--jc-primary)', color: 'var(--jc-on-primary)' }}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className="rounded-md px-2.5 py-1 text-[11px]"
                  style={{
                    backgroundColor: 'var(--jc-surface)',
                    color: 'var(--jc-text-2)',
                    border: '1px solid var(--jc-border-strong)',
                  }}
                >
                  A revisar
                </button>
              </div>
            </div>

            <div
              className="p-3"
              style={{
                backgroundColor: 'var(--jc-surface)',
                border: '1px solid var(--jc-border)',
                borderRadius: 'var(--jc-radius)',
              }}
            >
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--jc-text)' }}>
                Qué estamos buscando
              </p>
              <p className="text-[11px]" style={{ color: 'var(--jc-muted)' }}>
                ARG · 10.000 a 50.000 seguidores · engagement mínimo 3%
              </p>
            </div>
          </main>
        </div>
        </div>
      </div>
    </div>
  )
}
