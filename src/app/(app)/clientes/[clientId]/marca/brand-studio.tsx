"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { ErrorState, InfoNote } from '@/components/ui/states'
import { ConfirmButton } from '@/components/ui/confirm'
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

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string; hint: string }> = [
  { key: 'primary', label: 'Color de marca', hint: 'Botones, enlaces y acentos.' },
  { key: 'onPrimary', label: 'Texto sobre la marca', hint: 'Se calcula solo, pero se puede forzar.' },
  { key: 'accent', label: 'Acento', hint: 'Estados y detalles secundarios.' },
  { key: 'background', label: 'Fondo', hint: 'El lienzo de las pantallas.' },
  { key: 'surface', label: 'Superficie', hint: 'Tarjetas y tablas.' },
  { key: 'text', label: 'Texto', hint: 'El texto principal.' },
  { key: 'muted', label: 'Texto secundario', hint: 'Descripciones y ayudas.' },
  { key: 'border', label: 'Bordes', hint: 'Separadores y contornos.' },
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
      if (data.fontHints[0]) setFontBody(data.fontHints[0])
      if (data.fontHints[1] ?? data.fontHints[0]) setFontHeading(data.fontHints[1] ?? data.fontHints[0] ?? '')
      setRemoveLogo(false)
      toast.success('Propuesta lista. Revisala y ajustá lo que haga falta.')
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
        const mensaje = 'No se pudo guardar la identidad. Reintentá; si vuelve a pasar, avisale al equipo.'
        setError(mensaje)
        toast.error(mensaje)
        return
      }
      if (!result.ok) {
        setError(result.message)
        toast.error(result.message)
        return
      }
      toast.success(
        status === 'APPROVED'
          ? `Listo. ${clientName} ya ve su espacio con esta identidad.`
          : 'Borrador guardado. Todavía no lo ve el cliente.',
      )
      setProposal(null)
      router.refresh()
    })
  }

  function dibujarMural() {
    startMural(async () => {
      const result = await drawMuralAction({ clientId }).catch(() => null)
      if (!result) {
        toast.error('No se pudo dibujar el mural. Reintentá en un momento.')
        return
      }
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      if (result.data.status !== 'READY') {
        // El intento quedó registrado con su motivo; no se finge que salió bien.
        toast.error(result.data.motivo ?? 'El modelo no devolvió un dibujo utilizable.')
        return
      }
      toast.success(result.data.concepto ?? 'Mural listo.')
      router.refresh()
    })
  }

  function quitarMural() {
    startMural(async () => {
      const result = await removeMuralAction({ clientId }).catch(() => null)
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.message : 'No se pudo quitar el mural.')
        return
      }
      toast.success('Se quitó el mural.')
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
      toast.success('Se volvió al tema neutro de JC.')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1 · De dónde sacamos la identidad</CardTitle>
            <p className="text-xs text-ink-500">
              Analizamos el material y proponemos una paleta. Después la ajustás a mano.
            </p>
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
              <Field label="Fuente" htmlFor="source" className="min-w-56 flex-1">
                <Select
                  id="source"
                  value={source}
                  onChange={(event) => setSource(event.target.value as PickableSource)}
                >
                  <option value="WEBSITE">Sitio web del cliente</option>
                  <option value="INSTAGRAM">Instagram del cliente</option>
                  <option value="UPLOAD">Subir el logo o una captura</option>
                </Select>
              </Field>
              <Field label="Modo" htmlFor="mode" className="w-40">
                <Select id="mode" value={mode} onChange={(event) => setMode(event.target.value as 'LIGHT' | 'DARK')}>
                  <option value="LIGHT">Claro</option>
                  <option value="DARK">Oscuro</option>
                </Select>
              </Field>
            </div>

            <form action={extract} className="space-y-3">
              <input type="hidden" name="kind" value={source} />

              {source === 'INSTAGRAM' ? (
                <>
                  <Field label="Usuario de Instagram" htmlFor="handle" required>
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
                    <InfoNote>
                      Para leer un perfil de Instagram hace falta el proveedor de scouting configurado. Mientras tanto,
                      usá el sitio web o subí el logo.
                    </InfoNote>
                  ) : null}
                </>
              ) : source === 'UPLOAD' ? (
                <Field label="Archivo" htmlFor="file" hint="PNG, JPG o WebP. Máximo 10 MB." required>
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
                <Field label="Dirección del sitio" htmlFor="website" required>
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
                {pending ? 'Analizando…' : 'Analizar y proponer'}
              </Button>
            </form>

            {error ? <ErrorState title={error} /> : null}

            {proposal ? (
              <div className="space-y-3 rounded-lg border border-ink-200 p-3">
                <p className="text-sm font-medium text-ink-800">
                  {proposal.siteTitle ? `Encontramos "${proposal.siteTitle}"` : 'Propuesta generada'}
                </p>
                {proposal.colors.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs text-ink-500">
                      Colores detectados. Tocá uno para usarlo como color de marca.
                    </p>
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
                    Tipografías detectadas: {proposal.fontHints.join(', ')}
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
            <CardTitle>2 · Ajuste fino</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-ink-700" htmlFor={`color-${field.key}`}>
                    {field.label}
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
                      aria-label={`${field.label} en hexadecimal`}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">{field.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tipografía de títulos" htmlFor="fontHeading" hint="Nombre de Google Fonts.">
                <Input
                  id="fontHeading"
                  value={fontHeading}
                  onChange={(event) => setFontHeading(event.target.value)}
                  placeholder="Poppins"
                  maxLength={40}
                />
              </Field>
              <Field label="Tipografía de texto" htmlFor="fontBody" hint="Vacío usa la del sistema.">
                <Input
                  id="fontBody"
                  value={fontBody}
                  onChange={(event) => setFontBody(event.target.value)}
                  placeholder="Inter"
                  maxLength={40}
                />
              </Field>
              <Field label={`Esquinas (${radius}px)`} htmlFor="radius">
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
                Logo
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {logoPreview && !removeLogo ? (
                  <span className="flex h-12 items-center rounded-lg border border-ink-200 bg-surface px-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoPreview} alt="Logo del cliente" className="max-h-8 max-w-32 object-contain" />
                  </span>
                ) : (
                  <span className="text-xs text-ink-500">Sin logo</span>
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
                    Quitar
                  </Button>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-ink-700">
              <Checkbox checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} className="mt-0.5" />
              <span>
                Modo seguro
                <span className="block text-xs text-ink-500">
                  Conserva el logo pero usa la paleta neutra de JC. Sirve cuando la marca no da contraste suficiente.
                </span>
              </span>
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3 · Legibilidad</CardTitle>
            <p className="text-xs text-ink-500">
              Se mide el contraste real de cada par según WCAG 2.1. Lo que no llega, se corrige solo.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            {blocking.length === 0 && corrected.length === 0 ? (
              <p className="text-sm text-emerald-700">
                Todos los pares superan el contraste mínimo sin necesidad de ajustes.
              </p>
            ) : null}
            {corrected.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium text-ink-800">Ajustados automáticamente</p>
                <ul className="space-y-0.5 text-xs text-ink-600">
                  {corrected.map((issue) => (
                    <li key={issue.pair}>
                      {issue.pair}: estaba en {issue.ratio}:1, el mínimo es {issue.minimum}:1. Se ajustó el tono un{' '}
                      {Math.round(issue.adjustment * 100)}%.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {blocking.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-semibold text-rose-900">No se puede aprobar así</p>
                <ul className="mt-1 space-y-0.5 text-xs text-rose-800">
                  {blocking.map((issue) => (
                    <li key={issue.pair}>
                      {issue.pair}: {issue.ratio}:1, hace falta {issue.minimum}:1. Para que se lea habría que
                      cambiar el color un {Math.round(issue.adjustment * 100)}%, con lo que dejaría de ser el de la marca.
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-rose-800">
                  Elegí colores con más contraste, o activá el modo seguro para conservar el logo con la paleta neutra.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 text-xs text-ink-600">
              <span>
                Texto sobre fondo:{' '}
                <strong className="tabular-nums">{contrastBetween(resolved.colors.text, resolved.colors.background).toFixed(2)}:1</strong>
              </span>
              <span>
                Marca sobre superficie:{' '}
                <strong className="tabular-nums">{contrastBetween(resolved.colors.primary, resolved.colors.surface).toFixed(2)}:1</strong>
              </span>
              <span>
                Texto del botón:{' '}
                <strong className="tabular-nums">{contrastBetween(resolved.colors.onPrimary, resolved.colors.primary).toFixed(2)}:1</strong>
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4 · Mural del espacio</CardTitle>
            <p className="text-xs text-ink-500">
              Un dibujo que la IA hace para esta marca y que se ve translúcido detrás del contenido del portal. Es
              decoración: no dice nada, así que si no está no falta ningún dato.
            </p>
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
                    alt={brand.mural.alt ?? 'Mural de la marca'}
                    className="size-full object-contain"
                  />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-ink-800">{brand.mural.alt ?? 'Mural dibujado para esta marca.'}</p>
                  <p className="text-xs text-ink-500">Dibujado el {formatDate(brand.mural.generatedAt)}.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Todavía no hay mural para esta marca.</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={dibujarMural} disabled={dibujando || brand.status !== 'APPROVED'}>
                {dibujando ? 'Dibujando…' : brand.mural ? 'Dibujar otro' : 'Dibujar el mural'}
              </Button>
              {brand.mural ? (
                <Button variant="ghost" size="sm" onClick={quitarMural} disabled={dibujando}>
                  Quitar el mural
                </Button>
              ) : null}
            </div>

            {brand.status !== 'APPROVED' ? (
              <InfoNote>
                El mural se dibuja con la paleta que ya está en vivo. Aplicá primero la identidad al espacio del
                cliente.
              </InfoNote>
            ) : (
              <p className="text-xs text-ink-500">
                Cuesta una llamada al modelo y cuenta contra el tope mensual de gasto en IA.
              </p>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save('APPROVED')} disabled={pending || (blocking.length > 0 && !safeMode)}>
            {pending ? 'Guardando…' : 'Aplicar al espacio del cliente'}
          </Button>
          <Button variant="secondary" onClick={() => save('DRAFT')} disabled={pending}>
            Guardar borrador
          </Button>
          {brand.status === 'APPROVED' ? (
            <ConfirmButton
              title="Volver al tema neutro"
              description={`${clientName} va a ver su espacio con la identidad de JC otra vez. Se borra el logo y la paleta guardada.`}
              confirmLabel="Volver al neutro"
              onConfirm={reset}
              pending={pending}
            >
              <Button variant="ghost" disabled={pending}>
                Quitar identidad
              </Button>
            </ConfirmButton>
          ) : null}
          <Badge tone={brand.status === 'APPROVED' ? 'emerald' : 'amber'}>
            {brand.status === 'APPROVED' ? 'En vivo' : 'Borrador · el cliente todavía no lo ve'}
          </Badge>
        </div>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <BrandPreview
          theme={resolved}
          clientName={clientName}
          logoUrl={removeLogo ? null : logoPreview}
          logoIsDark={proposal?.logoIsDark ?? brand.logoIsDark}
        />
      </div>
    </div>
  )
}
