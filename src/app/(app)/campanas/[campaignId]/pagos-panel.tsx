"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, FileText, Paperclip, Plus, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Stat, StatStrip } from '@/components/ui/stat'
import { ConfirmButton } from '@/components/ui/confirm'
import { InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { formatDate, formatMoney } from '@/lib/util/format'
import type { PlanDeCampana } from '@/lib/repos/pagos'
import {
  borrarMovimientoAction,
  crearMovimientoAction,
  guardarTerminosAction,
  marcarPagadoAction,
} from '../../actions/pagos'

/* El texto de cada dirección sale de `direccion<CLAVE>` en las traducciones. */
const DIRECCIONES = ['AGENCY_IN', 'TALENT_OUT', 'EXPENSE_OUT'] as const

/**
 * La plata de la campaña.
 *
 * Tres preguntas, en este orden, porque es el orden en que aparecen: cuánto
 * cuesta, cuánto entró y cuánto salió, y qué falta para poder cotizar.
 *
 * La regla que gobierna toda la pantalla: **un dato que no está no vale cero**.
 * Un cachet sin negociar no es un cachet de cero, y un fee que nadie definió no
 * es un fee del 0%. Cuando falta algo, el total no se muestra: se muestra qué
 * falta. Un número redondo que sale de huecos es la forma más cara de mentir.
 */
export function PagosPanel({
  plan,
  campaignId,
  puedeEditar,
}: {
  plan: PlanDeCampana
  campaignId: string
  puedeEditar: boolean
}) {
  const t = useTranslations('pagos')
  const idioma = useLocale()
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  const [abierto, setAbierto] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const { cuentas, saldos, terminos } = plan
  const plata = (valor: number | null) => (valor === null ? '—' : formatMoney(valor, plan.currency, idioma))
  /** Una frase del dominio, escrita en el idioma de quien mira. */
  const frase = (f: { clave: string; valores?: Record<string, string | number> } | null) =>
    f ? t(f.clave, f.valores) : undefined

  function guardarTerminos(formData: FormData) {
    startTransition(async () => {
      const resultado = await guardarTerminosAction({
        campaignId,
        feeMode: String(formData.get('feeMode') ?? 'PERCENT') as 'PERCENT' | 'FIXED' | 'NONE',
        feePercent: String(formData.get('feePercent') ?? '') || null,
        feeFixed: String(formData.get('feeFixed') ?? '') || null,
        productionCost: String(formData.get('productionCost') ?? '') || null,
        adSpend: String(formData.get('adSpend') ?? '') || null,
        terms: String(formData.get('terms') ?? '') || null,
        notes: String(formData.get('notes') ?? '') || null,
      }).catch(() => null)

      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeGuardo'))
        return
      }
      toast.success(t('terminosGuardados'))
      router.refresh()
    })
  }

  function crear(formData: FormData) {
    formData.set('campaignId', campaignId)
    startTransition(async () => {
      const resultado = await crearMovimientoAction(formData).catch(() => null)
      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeRegistro'))
        return
      }
      toast.success(t('movimientoRegistrado'))
      formRef.current?.reset()
      setAbierto(false)
      router.refresh()
    })
  }

  function alternarPago(paymentId: string, pagado: boolean) {
    startTransition(async () => {
      const resultado = await marcarPagadoAction({ paymentId, campaignId, pagado }).catch(() => null)
      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeActualizo'))
        return
      }
      toast.success(pagado ? t('marcadoPagado') : t('vuelvePendiente'))
      router.refresh()
    })
  }

  function borrar(paymentId: string) {
    startTransition(async () => {
      const resultado = await borrarMovimientoAction({ paymentId, campaignId }).catch(() => null)
      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeBorro'))
        return
      }
      toast.success(t('movimientoBorrado'))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat
          label={t('statInversion')}
          value={plata(cuentas.inversionEnTalento)}
          hint={t('confirmados', { cantidad: plan.talento.length })}
        />
        <Stat label={t('statFee')} value={plata(cuentas.feeDeAgencia)} hint={frase(cuentas.explicacionDelFee)} />
        <Stat
          label={t('statTotalCliente')}
          value={plata(cuentas.totalAlCliente)}
          tone={cuentas.faltaParaCotizar.length > 0 ? 'warn' : 'good'}
          hint={cuentas.faltaParaCotizar.length > 0 ? t('faltaInformacion') : t('listoParaCotizar')}
        />
        <Stat
          label={t('statNosDeben')}
          value={plata(saldos.AGENCY_IN.pendiente)}
          tone={saldos.AGENCY_IN.pendiente > 0 ? 'warn' : undefined}
          hint={t('yaCobrado', { monto: plata(saldos.AGENCY_IN.pagado) })}
        />
        <Stat
          label={t('statDebemos')}
          value={plata(saldos.TALENT_OUT.pendiente)}
          tone={saldos.TALENT_OUT.pendiente > 0 ? 'warn' : undefined}
          hint={t('yaPagado', { monto: plata(saldos.TALENT_OUT.pagado) })}
        />
      </StatStrip>

      {cuentas.faltaParaCotizar.length > 0 ? (
        <InfoNote>
          <p className="font-medium">{t('noSePuedeCotizar')}</p>
          <ul className="mt-1 list-inside list-disc">
            {cuentas.faltaParaCotizar.map((falta) => (
              <li key={falta.clave}>{t(falta.clave, falta.valores)}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">{t('faltaNoEsCero')}</p>
        </InfoNote>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('comoSeCotiza')}</CardTitle>
          <p className="text-xs text-ink-500">{t('comoSeCotizaBajada')}</p>
        </CardHeader>
        <CardBody>
          <form action={guardarTerminos} className="grid gap-4 sm:grid-cols-3">
            <Field label={t('campoFeeMode')} htmlFor="feeMode">
              <Select id="feeMode" name="feeMode" defaultValue={terminos.feeMode} disabled={!puedeEditar}>
                <option value="PERCENT">{t('feeModePercent')}</option>
                <option value="FIXED">{t('feeModeFixed')}</option>
                <option value="NONE">{t('feeModeNone')}</option>
              </Select>
            </Field>
            <Field label={t('campoPorcentaje')} htmlFor="feePercent" hint={t('porcentajeAyuda')}>
              <Input
                id="feePercent"
                name="feePercent"
                inputMode="decimal"
                placeholder="20"
                defaultValue={terminos.feePercent ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label={t('campoMontoFijo')} htmlFor="feeFixed" hint={t('montoFijoAyuda')}>
              <Input
                id="feeFixed"
                name="feeFixed"
                inputMode="decimal"
                defaultValue={terminos.feeFixed ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label={t('campoProduccion')} htmlFor="productionCost" hint={t('produccionAyuda')}>
              <Input
                id="productionCost"
                name="productionCost"
                inputMode="decimal"
                defaultValue={terminos.productionCost ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label={t('campoPauta')} htmlFor="adSpend" hint={t('pautaAyuda')}>
              <Input
                id="adSpend"
                name="adSpend"
                inputMode="decimal"
                defaultValue={terminos.adSpend ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label={t('campoCondiciones')} htmlFor="terms" hint={t('condicionesAyuda')}>
              <Input id="terms" name="terms" defaultValue={terminos.terms ?? ''} disabled={!puedeEditar} />
            </Field>
            <Field label={t('campoNotasInternas')} htmlFor="notes" className="sm:col-span-3">
              <Textarea id="notes" name="notes" rows={2} defaultValue={terminos.notes ?? ''} disabled={!puedeEditar} />
            </Field>
            {puedeEditar ? (
              <div className="sm:col-span-3">
                <Button type="submit" disabled={pendiente}>
                  {pendiente ? t('guardando') : t('guardarTerminos')}
                </Button>
              </div>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('porInfluencer')}</CardTitle>
          <p className="text-xs text-ink-500">{t('porInfluencerBajada')}</p>
        </CardHeader>
        <CardBody className="p-0">
          {plan.talento.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">{t('sinConfirmados')}</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('colInfluencer')}</Th>
                    <Th className="text-right">{t('colAcordado')}</Th>
                    <Th className="text-right">{t('colPagado')}</Th>
                    <Th className="text-right">{t('colPendiente')}</Th>
                    <Th>{t('colEstado')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {plan.talento.map((linea) => {
                    const falta = linea.acordado === null ? null : linea.acordado - linea.pagado
                    return (
                      <Tr key={linea.candidacyId}>
                        <Td className="font-medium text-ink-900">{linea.nombre}</Td>
                        <Td className="text-right tabular-nums">
                          {linea.acordado === null ? (
                            <span className="text-amber-700">{t('sinAcordar')}</span>
                          ) : (
                            formatMoney(linea.acordado, plan.currency, idioma)
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(linea.pagado, plan.currency, idioma)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(linea.pendiente, plan.currency, idioma)}
                        </Td>
                        <Td>
                          {linea.acordado === null ? (
                            <Badge tone="amber">{t('faltaElCachet')}</Badge>
                          ) : falta !== null && falta <= 0 && linea.pagado > 0 ? (
                            <Badge tone="emerald">{t('saldado')}</Badge>
                          ) : linea.pagado > 0 ? (
                            <Badge tone="blue">{t('pagoParcial')}</Badge>
                          ) : (
                            <Badge tone="slate">{t('sinPagar')}</Badge>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('movimientos')}</CardTitle>
          <p className="text-xs text-ink-500">{t('movimientosBajada')}</p>
        </CardHeader>
        <CardBody className="space-y-3">
          {puedeEditar ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)}>
                <Plus className="size-4" aria-hidden="true" />
                {abierto ? t('cerrarFormulario') : t('registrarMovimiento')}
              </Button>

              {abierto ? (
                <form ref={formRef} action={crear} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-3">
                  <Field label={t('campoQuePaso')} htmlFor="direction" required>
                    <Select id="direction" name="direction" required>
                      {DIRECCIONES.map((valor) => (
                        <option key={valor} value={valor}>
                          {t(`direccion${valor}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('campoMonto')} htmlFor="amount" required hint={t('montoAyuda', { moneda: plan.currency })}>
                    <Input id="amount" name="amount" inputMode="decimal" required />
                  </Field>
                  <Field label={t('colEstado')} htmlFor="status" required>
                    <Select id="status" name="status" defaultValue="PENDING" required>
                      <option value="PENDING">{t('estadoPendiente')}</option>
                      <option value="PAID">{t('estadoYaPagado')}</option>
                    </Select>
                  </Field>
                  <Field label={t('campoConcepto')} htmlFor="concept" required className="sm:col-span-2">
                    <Input id="concept" name="concept" placeholder={t('conceptoPista')} required maxLength={200} />
                  </Field>
                  <Field label={t('campoInfluencer')} htmlFor="candidacyId" hint={t('influencerAyuda')}>
                    <Select id="candidacyId" name="candidacyId" defaultValue="">
                      <option value="">—</option>
                      {plan.talento.map((linea) => (
                        <option key={linea.candidacyId} value={linea.candidacyId}>
                          {linea.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('campoVence')} htmlFor="dueDate">
                    <Input id="dueDate" name="dueDate" type="date" />
                  </Field>
                  <Field label={t('campoReferencia')} htmlFor="reference">
                    <Input id="reference" name="reference" maxLength={120} />
                  </Field>
                  <Field label={t('campoMetodo')} htmlFor="method" hint={t('metodoAyuda')}>
                    <Input id="method" name="method" maxLength={80} />
                  </Field>
                  <Field label={t('campoFactura')} htmlFor="documento" hint={t('facturaAyuda')} className="sm:col-span-2">
                    <Input
                      id="documento"
                      name="documento"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      className="h-auto py-1.5"
                    />
                  </Field>
                  <Field label={t('campoNotas')} htmlFor="notes" className="sm:col-span-3">
                    <Textarea id="notes" name="notes" rows={2} />
                  </Field>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={pendiente}>
                      {pendiente ? t('guardando') : t('registrar')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {plan.movimientos.length === 0 ? (
            <p className="text-sm text-ink-500">{t('sinMovimientos')}</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('colConcepto')}</Th>
                    <Th>{t('colQuePaso')}</Th>
                    <Th className="text-right">{t('colMonto')}</Th>
                    <Th>{t('colEstado')}</Th>
                    <Th>{t('colFechas')}</Th>
                    <Th>{t('colFactura')}</Th>
                    {puedeEditar ? <Th className="text-right">{t('colAcciones')}</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {plan.movimientos.map((movimiento) => (
                    <Tr key={movimiento.id}>
                      <Td>
                        <span className="font-medium text-ink-900">{movimiento.concept}</span>
                        {movimiento.quien ? <p className="text-xs text-ink-500">{movimiento.quien}</p> : null}
                        {movimiento.reference ? (
                          <p className="text-xs text-ink-500">{t('numeroDe', { valor: movimiento.reference })}</p>
                        ) : null}
                      </Td>
                      <Td className="text-xs text-ink-600">{t(`direccion${movimiento.direction}`)}</Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(movimiento.amount, movimiento.currency, idioma)}
                      </Td>
                      <Td>
                        {movimiento.status === 'PAID' ? (
                          <Badge tone="emerald">{t('badgePagado')}</Badge>
                        ) : movimiento.status === 'CANCELLED' ? (
                          <Badge tone="slate">{t('badgeCancelado')}</Badge>
                        ) : (
                          <Badge tone="amber">{t('badgePendiente')}</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {movimiento.paidAt
                          ? t('pagadoEl', { fecha: formatDate(movimiento.paidAt, undefined, idioma) })
                          : movimiento.dueDate
                            ? t('venceEl', { fecha: formatDate(movimiento.dueDate, undefined, idioma) })
                            : '—'}
                      </Td>
                      <Td className="text-xs">
                        {movimiento.documento ? (
                          <a
                            href={movimiento.documento.url}
                            className="inline-flex items-center gap-1 text-brand-700 underline underline-offset-4"
                          >
                            <FileText className="size-3.5" aria-hidden="true" />
                            {movimiento.documento.nombre}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-ink-400">
                            <Paperclip className="size-3.5" aria-hidden="true" />
                            {t('sinAdjuntar')}
                          </span>
                        )}
                      </Td>
                      {puedeEditar ? (
                        <Td className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pendiente || movimiento.status === 'CANCELLED'}
                              onClick={() => alternarPago(movimiento.id, movimiento.status !== 'PAID')}
                            >
                              {movimiento.status === 'PAID' ? (
                                <>
                                  <Undo2 className="size-4" aria-hidden="true" />
                                  {t('deshacer')}
                                </>
                              ) : (
                                <>
                                  <Check className="size-4" aria-hidden="true" />
                                  {t('marcarPagado')}
                                </>
                              )}
                            </Button>
                            <ConfirmButton
                              title={t('borrarTitulo')}
                              description={t('borrarBajada')}
                              confirmLabel={t('borrar')}
                              onConfirm={() => borrar(movimiento.id)}
                              pending={pendiente}
                            >
                              <Button size="sm" variant="ghost" disabled={pendiente}>
                                <Trash2 className="size-4" aria-hidden="true" />
                                <span className="sr-only">{t('borrar')}</span>
                              </Button>
                            </ConfirmButton>
                          </div>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
