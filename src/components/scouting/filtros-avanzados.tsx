"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('scouting')
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
        <span className="font-medium">{t('masFiltros')}</span>
        <span className="text-xs text-ink-500">
          {puedeFiltrarAudiencia ? t('masFiltrosConAudiencia') : t('masFiltrosSinAudiencia')}
        </span>
      </button>

      <div id={id} hidden={!abierto} className="mt-3 grid gap-3 lg:grid-cols-2">
        <Grupo
          icono={<MapPin className="size-4" aria-hidden="true" />}
          titulo={t('grupoCreador')}
          bajada={t('grupoCreadorBajada')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('campoPaisCreador')}
              htmlFor="fPais"
              hint={t('paisCreadorAyuda')}
            >
              <Select id="fPais" name="fPais" defaultValue="">
                <option value="">{t('cualquierPais')}</option>
                <option value="AR">{t('paisAR')}</option>
                <option value="MX">{t('paisMX')}</option>
                <option value="ES">{t('paisES')}</option>
                <option value="CL">{t('paisCL')}</option>
                <option value="CO">{t('paisCO')}</option>
                <option value="UY">{t('paisUY')}</option>
                <option value="PE">{t('paisPE')}</option>
                <option value="US">{t('paisUS')}</option>
              </Select>
            </Field>
            <Field label={t('campoZona')} htmlFor="fZona" hint={t('zonaAyuda')}>
              <Input id="fZona" name="fZona" placeholder={t('zonaPista')} maxLength={60} />
            </Field>
          </div>
          <Field
            label={t('campoBioMenciona')}
            htmlFor="fBio"
            hint={t('bioMencionaAyuda')}
          >
            <Input id="fBio" name="fBio" placeholder={t('bioMencionaPista')} maxLength={60} />
          </Field>
        </Grupo>

        <Grupo
          icono={<Gauge className="size-4" aria-hidden="true" />}
          titulo={t('grupoRendimiento')}
          bajada={t('grupoRendimientoBajada')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('campoSegDesde')} htmlFor="fDesde">
              <Input id="fDesde" name="fDesde" inputMode="numeric" placeholder="10.000" />
            </Field>
            <Field label={t('campoSegHasta')} htmlFor="fHasta">
              <Input id="fHasta" name="fHasta" inputMode="numeric" placeholder="200.000" />
            </Field>
          </div>
          <Field
            label={t('campoErMinimo')}
            htmlFor="fEngagement"
            hint={t('erMinimoAyuda')}
          >
            <Input id="fEngagement" name="fEngagement" inputMode="decimal" placeholder="2,5" />
          </Field>
        </Grupo>

        {puedeFiltrarAudiencia ? (
          <Grupo
            icono={<Users className="size-4" aria-hidden="true" />}
            titulo={t('grupoAudiencia')}
            bajada={t('grupoAudienciaBajada')}
            className="lg:col-span-2"
          >
            {/*
              * Lo medido, no lo prometido.
              *
              * El proveedor ofrece estos filtros para todo el mundo, pero
              * midiéndolo contra su API el 27/08/2026 el dato de audiencia
              * existe casi sólo para Estados Unidos. Callarlo dejaría a alguien
              * armando una búsqueda que devuelve nueve personas de ciento diez
              * mil sin entender por qué, y creyendo que en Argentina no hay
              * nadie que sirva.
              */}
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t.rich('avisoAudiencia', {
                b: (texto) => <strong>{texto}</strong>,
                n: (texto) => <strong className="tabular-nums">{texto}</strong>,
              })}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('campoPaisPublico')} htmlFor="aPais">
                <Select id="aPais" name="aPais" defaultValue="">
                <option value="">{t('noImporta')}</option>
                <option value="AR">{t('paisAR')}</option>
                <option value="MX">{t('paisMX')}</option>
                <option value="ES">{t('paisES')}</option>
                <option value="CL">{t('paisCL')}</option>
                <option value="CO">{t('paisCO')}</option>
                <option value="UY">{t('paisUY')}</option>
                <option value="PE">{t('paisPE')}</option>
                <option value="US">{t('paisUS')}</option>
                </Select>
              </Field>

              <Field label={t('campoGeneroPublico')} htmlFor="aGenero">
                <Select id="aGenero" name="aGenero" defaultValue="">
                  <option value="">{t('noImporta')}</option>
                  <option value="female">{t('mayoriaMujeres')}</option>
                  <option value="male">{t('mayoriaVarones')}</option>
                </Select>
              </Field>

              <Field label={t('campoEdadPublico')} htmlFor="aEdad">
                <Select id="aEdad" name="aEdad" defaultValue="">
                  <option value="">{t('noImporta')}</option>
                  <option value="13-17">{t('edad13')}</option>
                  <option value="18-24">{t('edad18')}</option>
                  <option value="25-34">{t('edad25')}</option>
                  <option value="35-44">{t('edad35')}</option>
                  <option value="45-64">{t('edad45')}</option>
                  <option value="65+">{t('edad65')}</option>
                </Select>
              </Field>

              {/*
                Un solo porcentaje para los tres. Pedir uno por filtro daría
                control de más y una pantalla llena de campos que casi nadie
                cambia; con "al menos la mitad" se resuelve la búsqueda real.
              */}
              <Field
                label={t('campoAlMenos')}
                htmlFor="aPorcentaje"
                hint={t('alMenosAyuda')}
              >
                <Select id="aPorcentaje" name="aPorcentaje" defaultValue="50">
                  <option value="30">30 %</option>
                  <option value="50">{t('laMitad')}</option>
                  <option value="70">70 %</option>
                  <option value="85">85 %</option>
                </Select>
              </Field>
            </div>

            <Field
              label={t('campoAudienciaReal')}
              htmlFor="aCalidad"
              hint={t('audienciaRealAyuda')}
            >
              <Select id="aCalidad" name="aCalidad" defaultValue="">
                <option value="">{t('noImporta')}</option>
                <option value="60">{t('calidadAceptable')}</option>
                <option value="75">{t('calidadBuena')}</option>
                <option value="90">{t('calidadMuyBuena')}</option>
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
            {t('noSePuedeFiltrar')}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-ink-500">
            {puedeFiltrarAudiencia ? null : (
              <li>{t.rich('noAudiencia', { b: (texto) => <strong className="text-ink-600">{texto}</strong> })}</li>
            )}
            <li>{t.rich('noActividad', { b: (texto) => <strong className="text-ink-600">{texto}</strong> })}</li>
            <li>{t.rich('noHashtags', { b: (texto) => <strong className="text-ink-600">{texto}</strong> })}</li>
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
