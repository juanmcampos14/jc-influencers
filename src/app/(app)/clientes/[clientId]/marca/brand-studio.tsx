"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { ErrorState, InfoNote } from '@/components/ui/states'
import { ConfirmButton } from '@/components/ui/confirm'
import { cn } from '@/lib/util/format'
import { buildThemeFromBrandColors, contrastBetween, type ThemeColors } from '@/lib/domain/color'
import { resolveTheme } from '@/lib/domain/theme'
import { formatDate } from '@/lib/util/format'
import { dataUrlToFile } from '@/lib/util/data-url'
import type { BrandDto } from '@/lib/repos/brand'
import {
  drawMuralAction,
  extractBrandAction,
  removeMuralAction,
  resetBrandAction,
  saveBrandAction,
  type BrandProposal,
} from '../../../actions/brand'
import { BrandPreview } from './brand-preview'

type Source = 'WEBSITE' | 'INSTAGRAM' | 'UPLOAD' | 'MANUAL'
/** Lo que se puede elegir en el selector de fuente. */
type PickableSource = Exclude<Source, 'MANUAL'>

/*
 * Vive afuera del componente, así que no puede leer traducciones: guarda la
 * clave y el texto se resuelve al pintar. Lo de arriba era un `label` ya
 * escrito, y en inglés salía en castellano.
 */
const COLOR_FIELDS: Array<{ key: keyof ThemeColors; clave: string }> = [
  { key: 'primary', clave: 'colorPrimary' },
  { key: 'onPrimary', clave: 'colorOnPrimary' },
  { key: 'accent', clave: 'colorAccent' },
  { key: 'background', clave: 'colorBackground' },
  { key: 'surface', clave: 'colorSurface' },
  { key: 'text', clave: 'colorText' },
  { key: 'muted', clave: 'colorMuted' },
  { key: 'border', clave: 'colorBorder' },
]

export function BrandStudio({
  clientId,
  clientName,
  brand,
  instagramAvailable,
}: {
  clientId: string
  clientName: string
  brand: BrandDto
  instagramAvailable: boolean
}) {
  const t = useTranslations('clientes')
  const idioma = useLocale()
  const router = useRouter()
  /**
   * Fuente elegida en el selector. Nunca vale 'MANUAL': ese estado significa
   * "la paleta se editó a mano" y no es algo que se pueda elegir acá. Mantener
   * los dos sentidos en una sola variable hacía que el selector mostrara una
   * opción y el formulario mandara otra.
   */
  const [source, setSource] = React.useState<PickableSource>(
    brand.source === 'MANUAL' ? 'WEBSITE' : brand.source,
  )
  const [colors, setColors] = React.useState<ThemeColors>(brand.colors)
  const [mode, setMode] = React.useState<'LIGHT' | 'DARK'>(brand.mode)
  const [radius, setRadius] = React.useState(brand.radius)
  const [safeMode, setSafeMode] = React.useState(brand.safeMode)
  const [fontHeading, setFontHeading] = React.useState(brand.fontHeading ?? '')
  const [fontBody, setFontBody] = React.useState(brand.fontBody ?? '')
  /*
   * El texto de la fuente también vive fuera del formulario, por lo mismo que
   * los selectores de acá abajo: al terminar la acción de servidor React
   * devuelve los controles a su valor por defecto, y el campo quedaba vacío
   * justo cuando la propuesta aparecía en pantalla.
   */
  const [website, setWebsite] = React.useState(brand.sourceUrl ?? '')
  const [handle, setHandle] = React.useState('')
  const [proposal, setProposal] = React.useState<BrandProposal | null>(null)
  const [logoFile, setLogoFile] = React.useState<File | null>(null)
  const [logoPreview, setLogoPreview] = React.useState<string | null>(
    brand.hasLogo ? `/api/marca/${clientId}/logo?v=${brand.version}` : null,
  )
  const [removeLogo, setRemoveLogo] = React.useState(false)
  /*
   * El fondo elegido viaja como URL, no como imagen: la miniatura alcanza para
   * decidir y el servidor la vuelve a bajar al aplicar.
   */
  const [fondoUrl, setFondoUrl] = React.useState<string | null>(null)
  const [fondoVista, setFondoVista] = React.useState<string | null>(brand.fondo?.url ?? null)
  const [fondoOpacidad, setFondoOpacidad] = React.useState(brand.fondo?.opacidad ?? 8)
  const [quitarFondo, setQuitarFondo] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [dibujando, startMural] = React.useTransition()

  // El mismo cálculo que corre en el servidor: lo que se ve acá es lo que se guarda.
  const resolved = React.useMemo(
    () => resolveTheme({ colors, mode, radius, fontHeading, fontBody, safeMode }),
    [colors, mode, radius, fontHeading, fontBody, safeMode],
  )
  const blocking = resolved.report.issues.filter((issue) => !issue.fixed)
  const corrected = resolved.report.issues.filter((issue) => issue.fixed)

  function extract(formData: FormData) {
    formData.set('clientId', clientId)
    formData.set('mode', mode)
    setError(null)
    startTransition(async () => {
      const result = await extractBrandAction(formData)
      if (!result.ok) {
        setError(result.message)
        toast.error(result.message)
        return
      }
      const data = result.data
      setProposal(data)
      setColors(data.theme)
      setSource(data.source)
      if (data.logoDataUrl) setLogoPreview(data.logoDataUrl)
      // Se propone el primero, que es el que la marca eligió para presentarse.
      const primero = data.fondos[0]
      if (primero) {
        setFondoUrl(primero.url)
        setFondoVista(primero.miniatura)
        setQuitarFondo(false)
      }
      if (data.fontHints[0]) setFontBody(data.fontHints[0])
      if (data.fontHints[1] ?? data.fontHints[0]) setFontHeading(data.fontHints[1] ?? data.fontHints[0] ?? '')
      setRemoveLogo(false)
      toast.success(t('propuestaLista'))
    })
  }

  function save(status: 'DRAFT' | 'APPROVED') {
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('clientId', clientId)
      formData.set('source', source)
      formData.set('sourceUrl', proposal?.sourceUrl ?? brand.sourceUrl ?? '')
      formData.set('mode', mode)
      formData.set('radius', String(radius))
      formData.set('safeMode', String(safeMode))
      formData.set('status', status)
      formData.set('fontHeading', fontHeading)
      formData.set('fontBody', fontBody)
      formData.set('colors', JSON.stringify(colors))
      formData.set('version', String(brand.version))
      formData.set('fondoOpacidad', String(fondoOpacidad))
      if (quitarFondo) formData.set('quitarFondo', 'true')
      else if (fondoUrl) formData.set('fondoUrl', fondoUrl)
      if (proposal?.siteTitle) formData.set('siteTitle', proposal.siteTitle)
      if (proposal?.fontHints.length) formData.set('fontHints', proposal.fontHints.join(', '))
      if (removeLogo) formData.set('removeLogo', 'true')
      if (logoFile) {
        formData.set('logo', logoFile)
        formData.set('logoIsDark', String(proposal?.logoIsDark ?? brand.logoIsDark))
      } else if (proposal?.logoDataUrl && !removeLogo) {
        // El logo de la propuesta viaja como archivo, no como texto.
        formData.set('logo', dataUrlToFile(proposal.logoDataUrl, 'logo.png'))
        formData.set('logoIsDark', String(proposal.logoIsDark))
      }

      const result = await saveBrandAction(formData).catch(() => null)
      if (!result) {
        const mensaje = t('noSeGuardo')
        setError(mensaje)
        toast.error(mensaje)
        return
      }
      if (!result.ok) {
        setError(result.message)
        toast.error(result.message)
        return
      }
      if (result.data.aviso) toast.warning(result.data.aviso)
      else
        toast.success(
          status === 'APPROVED'
            ? t('aplicada', { nombre: clientName })
            : t('borradorGuardado'),
        )
      setProposal(null)
      router.refresh()
    })
  }

  function dibujarMural() {
    startMural(async () => {
      const result = await drawMuralAction({ clientId }).catch(() => null)
      if (!result) {
        toast.error(t('muralNoSeDibujo'))
        return
      }
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      if (result.data.status !== 'READY') {
        // El intento quedó registrado con su motivo; no se finge que salió bien.
        toast.error(result.data.motivo ?? t('muralNoDibujo'))
        return
      }
      toast.success(result.data.concepto ?? t('muralListo'))
      router.refresh()
    })
  }

  function quitarMural() {
    startMural(async () => {
      const result = await removeMuralAction({ clientId }).catch(() => null)
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.message : t('muralNoSeQuito'))
        return
      }
      toast.success(t('muralQuitado'))
      router.refresh()
    })
  }

  function reset() {
    startTransition(async () => {
      const result = await resetBrandAction({ clientId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t('volvioAlNeutro'))
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('paso1')}</CardTitle>
            <p className="text-xs text-ink-500">{t('paso1Bajada')}</p>
          </CardHeader>
          <CardBody className="space-y-4">
            {/*
              * Fuente y Modo eligen QUÉ se pide, no son datos del pedido: por eso
              * viven fuera del formulario y viajan en campos ocultos.
              *
              * Al terminar una acción de servidor, React resetea los controles
              * del formulario a su valor por defecto. Estando adentro, el
              * selector volvía a "Sitio web" mientras el estado seguía en
              * "Subir el logo": la pantalla mostraba una cosa y el formulario
              * mandaba otra.
              */}
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('fuente')} htmlFor="source" className="min-w-56 flex-1">
                <Select
                  id="source"
                  value={source}
                  onChange={(event) => setSource(event.target.value as PickableSource)}
                >
                  <option value="WEBSITE">{t('fuenteWeb')}</option>
                  <option value="INSTAGRAM">{t('fuenteInstagram')}</option>
                  <option value="UPLOAD">{t('fuenteSubir')}</option>
                </Select>
              </Field>
              <Field label={t('modo')} htmlFor="mode" className="w-40">
                <Select id="mode" value={mode} onChange={(event) => setMode(event.target.value as 'LIGHT' | 'DARK')}>
                  <option value="LIGHT">{t('modoClaro')}</option>
                  <option value="DARK">{t('modoOscuro')}</option>
                </Select>
              </Field>
            </div>

            <form action={extract} className="space-y-3">
              <input type="hidden" name="kind" value={source} />

              {source === 'INSTAGRAM' ? (
                <>
                  <Field label={t('usuarioInstagram')} htmlFor="handle" required>
                    <Input
                      id="handle"
                      name="handle"
                      placeholder="lamarca"
                      required
                      value={handle}
                      onChange={(event) => setHandle(event.target.value)}
                    />
                  </Field>
                  {!instagramAvailable ? (
                    <InfoNote>{t('instagramNoDisponible')}</InfoNote>
                  ) : null}
                </>
              ) : source === 'UPLOAD' ? (
                <Field label={t('archivo')} htmlFor="file" hint={t('archivoAyuda')} required>
                  <Input
                    id="file"
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    required
                    className="h-auto py-1.5"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setLogoFile(file)
                      setLogoPreview(file ? URL.createObjectURL(file) : logoPreview)
                    }}
                  />
                </Field>
              ) : (
                <Field label={t('direccionSitio')} htmlFor="website" required>
                  <Input
                    id="website"
                    name="website"
                    placeholder="lamarca.com"
                    required
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </Field>
              )}

              <Button type="submit" disabled={pending}>
                {pending ? t('analizando') : t('analizar')}
              </Button>
            </form>

            {error ? <ErrorState title={error} /> : null}

            {proposal ? (
              <div className="space-y-3 rounded-lg border border-ink-200 p-3">
                <p className="text-sm font-medium text-ink-800">
                  {proposal.siteTitle ? t('encontramos', { titulo: proposal.siteTitle }) : t('propuestaGenerada')}
                </p>
                {proposal.colors.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs text-ink-500">{t('coloresDetectados')}</p>
                    <div className="flex flex-wrap gap-2">
                      {proposal.colors.map((color) => (
                        <button
                          key={color.hex}
                          type="button"
                          title={color.origin}
                          onClick={() =>
                            setColors(buildThemeFromBrandColors([color.hex, ...proposal.colors.map((c) => c.hex)], mode))
                          }
                          className="flex items-center gap-2 rounded-lg border border-ink-300 px-2 py-1 text-xs hover:border-brand-500"
                        >
                          <span
                            className="size-5 rounded border border-ink-300"
                            style={{ backgroundColor: color.hex }}
                            aria-hidden="true"
                          />
                          <span className="font-mono">{color.hex}</span>
                        </button>
                      ))}
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-ink-500">
                      {proposal.colors.slice(0, 3).map((color) => (
                        <li key={`${color.hex}-origen`}>
                          <span className="font-mono">{color.hex}</span> — {color.origin}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {proposal.fontHints.length > 0 ? (
                  <p className="text-xs text-ink-600">
                    {t('tipografiasDetectadas', { lista: proposal.fontHints.join(', ') })}
                  </p>
                ) : null}
                {proposal.warnings.map((warning) => (
                  <InfoNote key={warning}>{warning}</InfoNote>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('paso2')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => {
                const etiqueta = t(field.clave)
                return (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-ink-700" htmlFor={`color-${field.key}`}>
                    {etiqueta}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`color-${field.key}`}
                      type="color"
                      value={colors[field.key]}
                      onChange={(event) => setColors((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="h-9 w-12 cursor-pointer rounded border border-ink-300 bg-surface p-0.5"
                    />
                    <Input
                      value={colors[field.key]}
                      onChange={(event) => setColors((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="font-mono text-xs"
                      maxLength={7}
                      aria-label={t('enHexadecimal', { campo: etiqueta })}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">{t(`${field.clave}Ayuda`)}</p>
                </div>
                )
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('tipografiaTitulos')} htmlFor="fontHeading" hint={t('tipografiaTitulosAyuda')}>
                <Input
                  id="fontHeading"
                  value={fontHeading}
                  onChange={(event) => setFontHeading(event.target.value)}
                  placeholder="Poppins"
                  maxLength={40}
                />
              </Field>
              <Field label={t('tipografiaTexto')} htmlFor="fontBody" hint={t('tipografiaTextoAyuda')}>
                <Input
                  id="fontBody"
                  value={fontBody}
                  onChange={(event) => setFontBody(event.target.value)}
                  placeholder="Inter"
                  maxLength={40}
                />
              </Field>
              <Field label={t('esquinas', { px: radius })} htmlFor="radius">
                <input
                  id="radius"
                  type="range"
                  min={0}
                  max={24}
                  value={radius}
                  onChange={(event) => setRadius(Number(event.target.value))}
                  className="mt-2 w-full accent-[var(--jc-primary)]"
                />
              </Field>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700" htmlFor="logo">
                {t('logo')}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {logoPreview && !removeLogo ? (
                  <span className="flex h-12 items-center rounded-lg border border-ink-200 bg-surface px-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoPreview} alt={t('logoAlt')} className="max-h-8 max-w-32 object-contain" />
                  </span>
                ) : (
                  <span className="text-xs text-ink-500">{t('sinLogo')}</span>
                )}
                <Input
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="h-auto w-auto py-1.5"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    setLogoFile(file)
                    setRemoveLogo(false)
                    if (file) setLogoPreview(URL.createObjectURL(file))
                  }}
                />
                {logoPreview && !removeLogo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRemoveLogo(true)
                      setLogoFile(null)
                    }}
                  >
                    {t('quitar')}
                  </Button>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-ink-700">
              <Checkbox checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} className="mt-0.5" />
              <span>
                {t('modoSeguro')}
                <span className="block text-xs text-ink-500">{t('modoSeguroAyuda')}</span>
              </span>
            </label>
          </CardBody>
        </Card>

        {(proposal?.fondos.length ?? 0) > 0 || fondoVista ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('paso3')}</CardTitle>
              <p className="text-xs text-ink-500">{t('paso3Bajada')}</p>
            </CardHeader>
            <CardBody className="space-y-4">
              {(proposal?.fondos.length ?? 0) > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs text-ink-500">{t('fondosEncontrados')}</p>
                  <div className="flex flex-wrap gap-2">
                    {proposal?.fondos.map((candidata) => {
                      const elegida = !quitarFondo && fondoUrl === candidata.url
                      return (
                        <button
                          key={candidata.url}
                          type="button"
                          onClick={() => {
                            setFondoUrl(candidata.url)
                            setFondoVista(candidata.miniatura)
                            setQuitarFondo(false)
                          }}
                          aria-pressed={elegida}
                          className={cn(
                            'overflow-hidden rounded-lg border-2 transition-colors',
                            elegida ? 'border-brand-500' : 'border-ink-200 hover:border-ink-400',
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={candidata.miniatura} alt="" className="h-20 w-36 object-cover" />
                          <span className="block px-1.5 py-1 text-[11px] text-ink-500">
                            {candidata.ancho}×{candidata.alto}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <Field
                label={t('intensidad', { pct: fondoOpacidad })}
                htmlFor="fondoOpacidad"
                hint={t('intensidadAyuda')}
              >
                <input
                  id="fondoOpacidad"
                  type="range"
                  min={4}
                  max={30}
                  value={fondoOpacidad}
                  onChange={(event) => setFondoOpacidad(Number(event.target.value))}
                  className="mt-2 w-full accent-[var(--jc-primary)]"
                  disabled={quitarFondo}
                />
              </Field>

              {fondoVista && !quitarFondo ? (
                <Button variant="ghost" size="sm" onClick={() => setQuitarFondo(true)}>
                  {t('sinFondoBoton')}
                </Button>
              ) : brand.fondo || proposal?.fondos.length ? (
                <p className="text-xs text-ink-500">
                  {t('sinFondo')}{' '}
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => setQuitarFondo(false)}
                  >
                    {t('volverAPonerElegido')}
                  </button>
                </p>
              ) : null}

              {brand.fondo?.sourceUrl && !proposal ? (
                <p className="text-[11px] text-ink-400">{t('fondoSalioDe', { url: brand.fondo.sourceUrl })}</p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('paso4')}</CardTitle>
            <p className="text-xs text-ink-500">{t('paso4Bajada')}</p>
          </CardHeader>
          <CardBody className="space-y-3">
            {blocking.length === 0 && corrected.length === 0 ? (
              <p className="text-sm text-emerald-700">{t('contrasteOk')}</p>
            ) : null}
            {corrected.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium text-ink-800">{t('ajustadosAuto')}</p>
                <ul className="space-y-0.5 text-xs text-ink-600">
                  {corrected.map((issue) => (
                    <li key={issue.pair}>
                      {t('ajustadoDetalle', {
                        par: issue.pair,
                        ratio: issue.ratio,
                        minimo: issue.minimum,
                        pct: Math.round(issue.adjustment * 100),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {blocking.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-semibold text-rose-900">{t('noSePuedeAprobar')}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-rose-800">
                  {blocking.map((issue) => (
                    <li key={issue.pair}>
                      {t('bloqueoDetalle', {
                        par: issue.pair,
                        ratio: issue.ratio,
                        minimo: issue.minimum,
                        pct: Math.round(issue.adjustment * 100),
                      })}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-rose-800">{t('bloqueoAyuda')}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 text-xs text-ink-600">
              <span>
                {t('contrasteTextoFondo')}{' '}
                <strong className="tabular-nums">{contrastBetween(resolved.colors.text, resolved.colors.background).toFixed(2)}:1</strong>
              </span>
              <span>
                {t('contrasteMarcaSuperficie')}{' '}
                <strong className="tabular-nums">{contrastBetween(resolved.colors.primary, resolved.colors.surface).toFixed(2)}:1</strong>
              </span>
              <span>
                {t('contrasteBoton')}{' '}
                <strong className="tabular-nums">{contrastBetween(resolved.colors.onPrimary, resolved.colors.primary).toFixed(2)}:1</strong>
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('paso5')}</CardTitle>
            <p className="text-xs text-ink-500">{t('paso5Bajada')}</p>
          </CardHeader>
          <CardBody className="space-y-3">
            {brand.mural ? (
              <div className="flex flex-wrap items-start gap-4">
                <span
                  className="grid size-32 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200"
                  style={{ backgroundColor: resolved.colors.background }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(brand.mural.svg)))}`}
                    alt={brand.mural.alt ?? t('muralAlt')}
                    className="size-full object-contain"
                  />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-ink-800">{brand.mural.alt ?? t('muralDescripcionPorDefecto')}</p>
                  <p className="text-xs text-ink-500">
                    {t('muralDibujadoEl', { fecha: formatDate(brand.mural.generatedAt, undefined, idioma) })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">{t('sinMural')}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={dibujarMural} disabled={dibujando || brand.status !== 'APPROVED'}>
                {dibujando ? t('dibujando') : brand.mural ? t('dibujarOtro') : t('dibujarMural')}
              </Button>
              {brand.mural ? (
                <Button variant="ghost" size="sm" onClick={quitarMural} disabled={dibujando}>
                  {t('quitarMural')}
                </Button>
              ) : null}
            </div>

            {brand.status !== 'APPROVED' ? (
              <InfoNote>{t('muralNecesitaAprobada')}</InfoNote>
            ) : (
              <p className="text-xs text-ink-500">{t('muralCuesta')}</p>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save('APPROVED')} disabled={pending || (blocking.length > 0 && !safeMode)}>
            {pending ? t('guardando') : t('aplicar')}
          </Button>
          <Button variant="secondary" onClick={() => save('DRAFT')} disabled={pending}>
            {t('guardarBorrador')}
          </Button>
          {brand.status === 'APPROVED' ? (
            <ConfirmButton
              title={t('volverNeutroTitulo')}
              description={t('volverNeutroBajada', { nombre: clientName })}
              confirmLabel={t('volverNeutroConfirmar')}
              onConfirm={reset}
              pending={pending}
            >
              <Button variant="ghost" disabled={pending}>
                {t('quitarIdentidad')}
              </Button>
            </ConfirmButton>
          ) : null}
          <Badge tone={brand.status === 'APPROVED' ? 'emerald' : 'amber'}>
            {brand.status === 'APPROVED' ? t('enVivo') : t('borradorNoVisible')}
          </Badge>
        </div>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <BrandPreview
          theme={resolved}
          clientName={clientName}
          logoUrl={removeLogo ? null : logoPreview}
          logoIsDark={proposal?.logoIsDark ?? brand.logoIsDark}
          fondoUrl={quitarFondo ? null : fondoVista}
          muralUrl={brand.mural ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(brand.mural.svg)))}` : null}
          fondoOpacidad={fondoOpacidad}
        />
      </div>
    </div>
  )
}
