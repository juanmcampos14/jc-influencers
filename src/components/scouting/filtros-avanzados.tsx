"use client"

import * as React from 'react'
import { ChevronDown, EyeOff, Gauge, MapPin, Users } from 'lucide-react'
import { Field, Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/util/format'

/**
 * Filtros avanzados del scouting.
 *
 * Están plegados por defecto: la mayoría de las búsquedas son tema + red, y
 * mostrar diez campos de entrada obliga a leerlos todos para descubrir que no
 * hacían falta.
 *
 * **Sólo hay campo para lo que se puede comprobar.** Falta a propósito "cuándo
 * publicó por última vez" y "con qué hashtags publica": el proveedor no
 * devuelve ninguna de las dos cosas, y un filtro que no filtra es peor que no
 * tener el filtro, porque el resultado parece verificado.
 *
 * Por eso el bloque de audiencia --de quién es el público-- aparece sólo si hay
 * un proveedor conectado que sepa aplicarlo. Con scrapers solos sigue estando
 * en la lista de lo que no se puede, que es la verdad en ese caso. La pantalla
 * no promete lo que la conexión de hoy no puede cumplir.
 */
export function FiltrosAvanzados({
  abierto,
  onToggle,
  puedeFiltrarAudiencia,
}: {
  abierto: boolean
  onToggle: () => void
  /** Si hay un proveedor conectado que filtre por el público del creador. */
  puedeFiltrarAudiencia: boolean
}) {
  const id = React.useId()

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={id}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors',
          abierto
            ? 'border-brand-400 bg-brand-50 text-ink-900'
            : 'border-ink-300 bg-surface text-ink-700 hover:border-ink-400',
        )}
      >
        <ChevronDown className={cn('size-4 transition-transform', abierto && 'rotate-180')} aria-hidden="true" />
        <span className="font-medium">Más filtros</span>
        <span className="text-xs text-ink-500">
          {puedeFiltrarAudiencia ? 'creador · rendimiento · audiencia' : 'creador · rendimiento'}
        </span>
      </button>

      <div id={id} hidden={!abierto} className="mt-3 grid gap-3 lg:grid-cols-2">
        <Grupo icono={<MapPin className="size-4" aria-hidden="true" />} titulo="Creador" bajada="Dónde está y qué dice su bio.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="País donde está"
              htmlFor="fPais"
              hint="Sale de lo que informa la red. No es el país de su audiencia."
            >
              <Select id="fPais" name="fPais" defaultValue="">
                <option value="">Cualquier país</option>
                <option value="AR">Argentina</option>
                <option value="MX">México</option>
                <option value="ES">España</option>
                <option value="CL">Chile</option>
                <option value="CO">Colombia</option>
                <option value="UY">Uruguay</option>
                <option value="PE">Perú</option>
                <option value="US">Estados Unidos</option>
              </Select>
            </Field>
            <Field label="Zona o ciudad" htmlFor="fZona" hint="Tiene que nombrarla en su bio.">
              <Input id="fZona" name="fZona" placeholder="CABA, Córdoba…" maxLength={60} />
            </Field>
          </div>
          <Field
            label="Su bio menciona"
            htmlFor="fBio"
            hint="Una palabra o frase, tal cual aparece en la bio."
          >
            <Input id="fBio" name="fBio" placeholder="contadora" maxLength={60} />
          </Field>
        </Grupo>

        <Grupo
          icono={<Gauge className="size-4" aria-hidden="true" />}
          titulo="Rendimiento"
          bajada="Seguidores y engagement leídos de la red."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Seguidores · desde" htmlFor="fDesde">
              <Input id="fDesde" name="fDesde" inputMode="numeric" placeholder="10.000" />
            </Field>
            <Field label="Seguidores · hasta" htmlFor="fHasta">
              <Input id="fHasta" name="fHasta" inputMode="numeric" placeholder="200.000" />
            </Field>
          </div>
          <Field
            label="Engagement mínimo (%)"
            htmlFor="fEngagement"
            hint="Promedio de sus últimos posteos, cuando la red lo informa."
          >
            <Input id="fEngagement" name="fEngagement" inputMode="decimal" placeholder="2,5" />
          </Field>
        </Grupo>

        {puedeFiltrarAudiencia ? (
          <Grupo
            icono={<Users className="size-4" aria-hidden="true" />}
            titulo="Audiencia"
            bajada="De quién es el público, no quién publica. Es lo que decide si una campaña llega."
            className="lg:col-span-2"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="País del público" htmlFor="aPais">
                <Select id="aPais" name="aPais" defaultValue="">
                  <option value="">No importa</option>
                  <option value="AR">Argentina</option>
                  <option value="MX">México</option>
                  <option value="ES">España</option>
                  <option value="CL">Chile</option>
                  <option value="CO">Colombia</option>
                  <option value="UY">Uruguay</option>
                  <option value="PE">Perú</option>
                  <option value="US">Estados Unidos</option>
                </Select>
              </Field>

              <Field label="Género del público" htmlFor="aGenero">
                <Select id="aGenero" name="aGenero" defaultValue="">
                  <option value="">No importa</option>
                  <option value="female">Mayoría mujeres</option>
                  <option value="male">Mayoría varones</option>
                </Select>
              </Field>

              <Field label="Edad del público" htmlFor="aEdad">
                <Select id="aEdad" name="aEdad" defaultValue="">
                  <option value="">No importa</option>
                  <option value="13-17">13 a 17</option>
                  <option value="18-24">18 a 24</option>
                  <option value="25-34">25 a 34</option>
                  <option value="35-44">35 a 44</option>
                  <option value="45-64">45 a 64</option>
                  <option value="65+">65 o más</option>
                </Select>
              </Field>

              {/*
                Un solo porcentaje para los tres. Pedir uno por filtro daría
                control de más y una pantalla llena de campos que casi nadie
                cambia; con "al menos la mitad" se resuelve la búsqueda real.
              */}
              <Field
                label="Al menos"
                htmlFor="aPorcentaje"
                hint="Del público tiene que cumplir lo elegido."
              >
                <Select id="aPorcentaje" name="aPorcentaje" defaultValue="50">
                  <option value="30">30 %</option>
                  <option value="50">la mitad</option>
                  <option value="70">70 %</option>
                  <option value="85">85 %</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Audiencia real"
              htmlFor="aCalidad"
              hint="Cuánto de ese público no son cuentas falsas."
            >
              <Select id="aCalidad" name="aCalidad" defaultValue="">
                <option value="">No importa</option>
                <option value="60">Aceptable o mejor</option>
                <option value="75">Buena o mejor</option>
                <option value="90">Muy buena</option>
              </Select>
            </Field>
          </Grupo>
        ) : null}

        {/*
          * Lo que NO se puede filtrar, declarado.
          *
          * Esconderlo dejaría al usuario buscándolo; ofrecerlo sin poder
          * cumplirlo sería peor. Se dice qué falta y por qué.
          */}
        <div className="rounded-xl border border-dashed border-ink-300 p-4 lg:col-span-2">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-700">
            <EyeOff className="size-4" aria-hidden="true" />
            Lo que todavía no se puede filtrar
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-ink-500">
            {puedeFiltrarAudiencia ? null : (
              <li>
                <strong className="text-ink-600">Audiencia</strong> — país, género y edad de quienes lo siguen. La
                fuente actual no los devuelve. Lo que sí confirmamos es dónde está el creador.
              </li>
            )}
            <li>
              <strong className="text-ink-600">Actividad reciente</strong> — cuándo publicó por última vez. No viene
              en los datos del perfil, así que un filtro acá sería una promesa vacía.
            </li>
            <li>
              <strong className="text-ink-600">Hashtags con los que publica</strong> — se puede buscar POR un
              hashtag arriba, pero no sabemos con cuáles publica habitualmente.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Grupo({
  icono,
  titulo,
  bajada,
  children,
  className,
}: {
  icono: React.ReactNode
  titulo: string
  bajada: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn('space-y-3 rounded-xl border border-ink-200 bg-surface p-4', className)}>
      <legend className="sr-only">{titulo}</legend>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600">
          {icono}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-900">{titulo}</p>
          <p className="text-xs text-ink-500">{bajada}</p>
        </div>
      </div>
      {children}
    </fieldset>
  )
}
