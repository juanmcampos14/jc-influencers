import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { platformLabel } from '@/lib/domain/labels'
import type { FiltrosDeBase } from '@/lib/repos/base-conocimiento'

/**
 * Los filtros de los descubiertos.
 *
 * Es un formulario GET, sin estado en el navegador: los filtros viven en la
 * URL, así que una búsqueda se guarda en favoritos, se manda por mensaje y el
 * botón "atrás" la devuelve entera. Además funciona sin JavaScript.
 *
 * Los seis filtros que se usan siempre están a la vista; los otros seis viven
 * en un `<details>` que se abre solo cuando alguno está puesto --si no, la
 * persona no encontraría el filtro que ella misma aplicó--.
 */

const REDES = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'TWITCH', 'X'] as const

export function FiltrosDeDescubiertos({ filtros }: { filtros: FiltrosDeBase }) {
  const t = useTranslations('descubiertos')
  const tEtiqueta = useTranslations('etiquetas')
  const avanzadoPuesto =
    (filtros.palabras ?? []).length > 0 ||
    (filtros.intereses ?? []).length > 0 ||
    Boolean(filtros.proveedor) ||
    (filtros.enPadron ?? 'CUALQUIERA') !== 'CUALQUIERA' ||
    (filtros.conCampanas ?? 'CUALQUIERA') !== 'CUALQUIERA' ||
    (filtros.visto ?? 'CUALQUIERA') !== 'CUALQUIERA'

  const hayAlguno =
    avanzadoPuesto ||
    Boolean(filtros.texto) ||
    Boolean(filtros.platform) ||
    Boolean(filtros.pais) ||
    filtros.seguidoresDesde != null ||
    filtros.seguidoresHasta != null ||
    filtros.engagementDesde != null

  return (
    <form
      method="get"
      role="search"
      className="mb-4 rounded-xl border border-ink-200 bg-surface p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
            {t('filtroBuscar')}
          </label>
          <Input id="q" name="q" defaultValue={filtros.texto ?? ''} placeholder={t('filtroBuscarPista')} />
        </div>

        <div className="w-36">
          <label htmlFor="red" className="mb-1 block text-xs font-medium text-ink-600">
            {t('filtroRed')}
          </label>
          <Select id="red" name="red" defaultValue={filtros.platform ?? ''}>
            <option value="">{t('filtroTodas')}</option>
            {REDES.map((red) => (
              <option key={red} value={red}>
                {platformLabel(tEtiqueta, red)}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-28">
          <label htmlFor="pais" className="mb-1 block text-xs font-medium text-ink-600">
            {t('filtroPais')}
          </label>
          <Input id="pais" name="pais" defaultValue={filtros.pais ?? ''} placeholder="AR" maxLength={40} />
        </div>

        <div className="w-32">
          <label htmlFor="segDesde" className="mb-1 block text-xs font-medium text-ink-600">
            {t('filtroSegDesde')}
          </label>
          <Input id="segDesde" name="segDesde" type="number" min={0} defaultValue={filtros.seguidoresDesde ?? ''} />
        </div>

        <div className="w-32">
          <label htmlFor="segHasta" className="mb-1 block text-xs font-medium text-ink-600">
            {t('filtroSegHasta')}
          </label>
          <Input id="segHasta" name="segHasta" type="number" min={0} defaultValue={filtros.seguidoresHasta ?? ''} />
        </div>

        <div className="w-28">
          <label htmlFor="erDesde" className="mb-1 block text-xs font-medium text-ink-600">
            {t('filtroErMinimo')}
          </label>
          <Input
            id="erDesde"
            name="erDesde"
            type="number"
            min={0}
            step="0.1"
            defaultValue={filtros.engagementDesde ?? ''}
          />
        </div>
      </div>

      <details open={avanzadoPuesto} className="mt-3 border-t border-ink-200 pt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-ink-600 hover:text-ink-900">
          {t('masFiltros')}
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label htmlFor="palabras" className="mb-1 block text-xs font-medium text-ink-600">
              {t('filtroPalabras')}
            </label>
            <Input
              id="palabras"
              name="palabras"
              defaultValue={(filtros.palabras ?? []).join(', ')}
              placeholder={t('filtroPalabrasPista')}
            />
          </div>

          <div className="min-w-44 flex-1">
            <label htmlFor="intereses" className="mb-1 block text-xs font-medium text-ink-600">
              {t('filtroIntereses')}
            </label>
            <Input id="intereses" name="intereses" defaultValue={(filtros.intereses ?? []).join(', ')} />
          </div>

          <div className="w-40">
            <label htmlFor="proveedor" className="mb-1 block text-xs font-medium text-ink-600">
              {t('filtroProveedor')}
            </label>
            <Select id="proveedor" name="proveedor" defaultValue={filtros.proveedor ?? ''}>
              <option value="">{t('filtroCualquiera')}</option>
              <option value="apify">Apify</option>
              <option value="brightdata">Bright Data</option>
              <option value="hypeauditor">HypeAuditor</option>
            </Select>
          </div>

          <div className="w-40">
            <label htmlFor="padron" className="mb-1 block text-xs font-medium text-ink-600">
              {t('filtroPadron')}
            </label>
            <Select id="padron" name="padron" defaultValue={filtros.enPadron ?? 'CUALQUIERA'}>
              <option value="CUALQUIERA">{t('filtroNoImporta')}</option>
              <option value="SI">{t('filtroSi')}</option>
              <option value="NO">{t('filtroTodaviaNo')}</option>
            </Select>
          </div>

          <div className="w-44">
            <label htmlFor="campanas" className="mb-1 block text-xs font-medium text-ink-600">
              {t('filtroCampanas')}
            </label>
            <Select id="campanas" name="campanas" defaultValue={filtros.conCampanas ?? 'CUALQUIERA'}>
              <option value="CUALQUIERA">{t('filtroNoImporta')}</option>
              <option value="SI">{t('filtroSi')}</option>
              <option value="NO">{t('filtroNunca')}</option>
            </Select>
          </div>

          <div className="w-44">
            <label htmlFor="visto" className="mb-1 block text-xs font-medium text-ink-600">
              {t('filtroVisto')}
            </label>
            <Select id="visto" name="visto" defaultValue={filtros.visto ?? 'CUALQUIERA'}>
              <option value="CUALQUIERA">{t('filtroAlgunaVez')}</option>
              <option value="ULTIMOS_30">{t('filtroUltimos30')}</option>
              <option value="ULTIMOS_90">{t('filtroUltimos90')}</option>
            </Select>
          </div>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">
          {t('filtrar')}
        </Button>
        {hayAlguno ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/influencers/descubiertos">{t('limpiar')}</Link>
          </Button>
        ) : null}
      </div>
    </form>
  )
}
