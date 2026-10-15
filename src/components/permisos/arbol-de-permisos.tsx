"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/field'
import {
  ARBOL_DE_PERMISOS,
  claveDeAccion,
  claveDeNodo,
  claveDeSeccion,
  conDependencias,
  type NodoDePermiso,
} from '@/lib/authz/arbol'
import type { Capability } from '@/lib/authz/capabilities'
import { cn } from '@/lib/util/format'

/**
 * El árbol de permisos, en casilleros.
 *
 * Antes esto era una lista plana de "permisos extra" con nombres del código
 * --`budget.manage`, `candidate.approve`-- y sólo se podía SUMAR sobre lo que
 * daba el rol. Para dejar a alguien sin ver la plata había que inventarle un rol.
 *
 * Acá cada fila es una sección o una pestaña de la aplicación, con dos
 * casilleros: **ver** y **editar**. Es la única distinción que no hay que
 * explicarle a nadie.
 *
 * Tres decisiones que se notan al usarlo:
 *
 * - **Editar implica ver**, y se resuelve solo. Marcar "editar" marca "ver", y
 *   desmarcar "ver" desmarca "editar": un permiso para cambiar algo que no se
 *   puede mirar no existe, la pantalla ni se abre.
 * - **El rol es un punto de partida, no una jaula.** Lo que viene del rol
 *   aparece marcado y se puede desmarcar; lo desmarcado queda como quitado.
 * - **Lo que un usuario de cliente nunca puede tener no se muestra.** Un
 *   casillero que la base va a ignorar es peor que no tenerlo.
 */

export function ArbolDePermisos({
  concedidas,
  onChange,
  delRol,
  prohibidas,
  disabled = false,
}: {
  concedidas: ReadonlySet<Capability>
  onChange: (siguiente: Set<Capability>) => void
  /** Lo que da el rol elegido, para poder señalar qué se cambió a mano. */
  delRol: ReadonlySet<Capability>
  /** Capacidades que no se pueden dar en este contexto. No se muestran. */
  prohibidas?: ReadonlySet<Capability>
  disabled?: boolean
}) {
  const t = useTranslations('permisos')
  const bloqueada = (cap: Capability | undefined): boolean => Boolean(cap && prohibidas?.has(cap))

  /**
   * Cambiar una capacidad y dejar que el árbol arregle lo que dependa.
   *
   * Al desmarcar "ver" hay que sacar también "editar" y las acciones del nodo:
   * si no, quedan marcadas sin efecto y la pantalla dice algo que no es.
   */
  function alternar(nodo: NodoDePermiso, cap: Capability, valor: boolean): void {
    const siguiente = new Set(concedidas)
    if (valor) {
      siguiente.add(cap)
      onChange(conDependencias(siguiente))
      return
    }
    siguiente.delete(cap)
    if (nodo.ver === cap) {
      if (nodo.editar) siguiente.delete(nodo.editar)
      for (const accion of nodo.acciones ?? []) siguiente.delete(accion.clave)
    }
    onChange(siguiente)
  }

  return (
    <div className="space-y-4">
      {ARBOL_DE_PERMISOS.map((seccion) => {
        const nodos = seccion.nodos.filter((nodo) => tieneAlgoQueMostrar(nodo, prohibidas))
        if (nodos.length === 0) return null

        return (
          <fieldset key={seccion.clave} className="rounded-xl border border-ink-200 bg-surface">
            <legend className="px-3 text-xs font-semibold uppercase tracking-wide text-ink-600">
              {t(claveDeSeccion(seccion.clave))}
            </legend>
            {seccion.conAyuda ? (
              <p className="px-4 pb-1 text-xs text-ink-500">{t(`${claveDeSeccion(seccion.clave)}Ayuda`)}</p>
            ) : null}

            <div className="divide-y divide-ink-100">
              {nodos.map((nodo) => (
                <div key={nodo.clave} className="flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3">
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-medium text-ink-900">{t(claveDeNodo(nodo.clave))}</p>
                    {nodo.conAyuda ? (
                      <p className="mt-0.5 text-xs text-ink-500">{t(`${claveDeNodo(nodo.clave)}Ayuda`)}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {nodo.ver && !bloqueada(nodo.ver) ? (
                      <Casilla
                        etiqueta={t('ver')}
                        marcada={concedidas.has(nodo.ver)}
                        delRol={delRol.has(nodo.ver)}
                        disabled={disabled}
                        onChange={(valor) => alternar(nodo, nodo.ver!, valor)}
                      />
                    ) : null}

                    {nodo.editar && !bloqueada(nodo.editar) ? (
                      <Casilla
                        etiqueta={t('editar')}
                        marcada={concedidas.has(nodo.editar)}
                        delRol={delRol.has(nodo.editar)}
                        disabled={disabled}
                        onChange={(valor) => alternar(nodo, nodo.editar!, valor)}
                      />
                    ) : null}

                    {(nodo.acciones ?? [])
                      .filter((accion) => !bloqueada(accion.clave))
                      .map((accion) => (
                        <Casilla
                          key={accion.clave}
                          etiqueta={t(claveDeAccion(accion.clave))}
                          ayuda={accion.conAyuda ? t(`${claveDeAccion(accion.clave)}Ayuda`) : undefined}
                          marcada={concedidas.has(accion.clave)}
                          delRol={delRol.has(accion.clave)}
                          disabled={disabled}
                          onChange={(valor) => alternar(nodo, accion.clave, valor)}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

function Casilla({
  etiqueta,
  ayuda,
  marcada,
  delRol,
  disabled,
  onChange,
}: {
  etiqueta: string
  ayuda?: string
  marcada: boolean
  delRol: boolean
  disabled: boolean
  onChange: (valor: boolean) => void
}) {
  const t = useTranslations('permisos')
  const cambiado = marcada !== delRol
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 text-sm',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      title={ayuda}
    >
      <Checkbox checked={marcada} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className={cn(marcada ? 'text-ink-900' : 'text-ink-600')}>{etiqueta}</span>
      {/*
        Lo cambiado respecto del rol se señala. Sin esto, quien desmarca "ver
        plata" de un account manager no tiene forma de recordar, una semana
        después, si eso fue a propósito o viene del rol.
      */}
      {cambiado ? (
        <span
          className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-900"
          title={marcada ? t('sumadoAyuda') : t('quitadoAyuda')}
        >
          {marcada ? t('sumado') : t('quitado')}
        </span>
      ) : null}
    </label>
  )
}

function tieneAlgoQueMostrar(nodo: NodoDePermiso, prohibidas?: ReadonlySet<Capability>): boolean {
  const visible = (cap: Capability | undefined): boolean => Boolean(cap && !prohibidas?.has(cap))
  return visible(nodo.ver) || visible(nodo.editar) || (nodo.acciones ?? []).some((a) => visible(a.clave))
}
