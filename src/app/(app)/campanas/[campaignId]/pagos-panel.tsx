"use client"

import * as React from 'react'
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

const DIRECCIONES = {
  AGENCY_IN: 'El cliente nos paga',
  TALENT_OUT: 'Le pagamos al influencer',
  EXPENSE_OUT: 'Otro gasto de la campaña',
} as const

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
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  const [abierto, setAbierto] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const { cuentas, saldos, terminos } = plan
  const plata = (valor: number | null) => (valor === null ? '—' : formatMoney(valor, plan.currency))

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
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo guardar.')
        return
      }
      toast.success('Términos guardados.')
      router.refresh()
    })
  }

  function crear(formData: FormData) {
    formData.set('campaignId', campaignId)
    startTransition(async () => {
      const resultado = await crearMovimientoAction(formData).catch(() => null)
      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo registrar el movimiento.')
        return
      }
      toast.success('Movimiento registrado.')
      formRef.current?.reset()
      setAbierto(false)
      router.refresh()
    })
  }

  function alternarPago(paymentId: string, pagado: boolean) {
    startTransition(async () => {
      const resultado = await marcarPagadoAction({ paymentId, campaignId, pagado }).catch(() => null)
      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo actualizar.')
        return
      }
      toast.success(pagado ? 'Marcado como pagado.' : 'Vuelve a estar pendiente.')
      router.refresh()
    })
  }

  function borrar(paymentId: string) {
    startTransition(async () => {
      const resultado = await borrarMovimientoAction({ paymentId, campaignId }).catch(() => null)
      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo borrar.')
        return
      }
      toast.success('Movimiento borrado.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat label="Inversión en talento" value={plata(cuentas.inversionEnTalento)} hint={`${plan.talento.length} confirmados`} />
        <Stat label="Fee de la agencia" value={plata(cuentas.feeDeAgencia)} hint={cuentas.explicacionDelFee} />
        <Stat
          label="Total al cliente"
          value={plata(cuentas.totalAlCliente)}
          tone={cuentas.faltaParaCotizar.length > 0 ? 'warn' : 'good'}
          hint={cuentas.faltaParaCotizar.length > 0 ? 'Falta información' : 'Listo para cotizar'}
        />
        <Stat
          label="Nos deben"
          value={plata(saldos.AGENCY_IN.pendiente)}
          tone={saldos.AGENCY_IN.pendiente > 0 ? 'warn' : undefined}
          hint={`${plata(saldos.AGENCY_IN.pagado)} ya cobrado`}
        />
        <Stat
          label="Debemos al talento"
          value={plata(saldos.TALENT_OUT.pendiente)}
          tone={saldos.TALENT_OUT.pendiente > 0 ? 'warn' : undefined}
          hint={`${plata(saldos.TALENT_OUT.pagado)} ya pagado`}
        />
      </StatStrip>

      {cuentas.faltaParaCotizar.length > 0 ? (
        <InfoNote>
          <p className="font-medium">Todavía no se puede cotizar del todo.</p>
          <ul className="mt-1 list-inside list-disc">
            {cuentas.faltaParaCotizar.map((falta) => (
              <li key={falta}>{falta}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Lo que falta no se cuenta como cero: los totales de arriba son sobre lo que ya está cargado.
          </p>
        </InfoNote>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cómo se cotiza esta campaña</CardTitle>
          <p className="text-xs text-ink-500">
            Sólo lo ve la agencia. Los perfiles cuentan como costo recién cuando están confirmados: sumar los que
            están en screening infla la cotización con gente que capaz nunca participe.
          </p>
        </CardHeader>
        <CardBody>
          <form action={guardarTerminos} className="grid gap-4 sm:grid-cols-3">
            <Field label="La agencia cobra" htmlFor="feeMode">
              <Select id="feeMode" name="feeMode" defaultValue={terminos.feeMode} disabled={!puedeEditar}>
                <option value="PERCENT">Un % de la inversión en talento</option>
                <option value="FIXED">Un monto fijo</option>
                <option value="NONE">No cobra fee acá</option>
              </Select>
            </Field>
            <Field label="Porcentaje" htmlFor="feePercent" hint="Sólo si cobra por porcentaje.">
              <Input
                id="feePercent"
                name="feePercent"
                inputMode="decimal"
                placeholder="20"
                defaultValue={terminos.feePercent ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label="Monto fijo" htmlFor="feeFixed" hint="Sólo si cobra un fijo.">
              <Input
                id="feeFixed"
                name="feeFixed"
                inputMode="decimal"
                defaultValue={terminos.feeFixed ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label="Producción" htmlFor="productionCost" hint="Edición, envíos, viáticos.">
              <Input
                id="productionCost"
                name="productionCost"
                inputMode="decimal"
                defaultValue={terminos.productionCost ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label="Pauta" htmlFor="adSpend" hint="Plata para amplificar el contenido.">
              <Input
                id="adSpend"
                name="adSpend"
                inputMode="decimal"
                defaultValue={terminos.adSpend ?? ''}
                disabled={!puedeEditar}
              />
            </Field>
            <Field label="Condiciones de pago" htmlFor="terms" hint="50% al confirmar, 50% contra publicación…">
              <Input id="terms" name="terms" defaultValue={terminos.terms ?? ''} disabled={!puedeEditar} />
            </Field>
            <Field label="Notas internas" htmlFor="notes" className="sm:col-span-3">
              <Textarea id="notes" name="notes" rows={2} defaultValue={terminos.notes ?? ''} disabled={!puedeEditar} />
            </Field>
            {puedeEditar ? (
              <div className="sm:col-span-3">
                <Button type="submit" disabled={pendiente}>
                  {pendiente ? 'Guardando…' : 'Guardar términos'}
                </Button>
              </div>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por influencer</CardTitle>
          <p className="text-xs text-ink-500">Lo acordado sale de la ficha de cada perfil en la campaña.</p>
        </CardHeader>
        <CardBody className="p-0">
          {plan.talento.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">
              Todavía no hay perfiles confirmados. Cuando los haya, acá se ve cuánto se le acordó a cada uno y cuánto
              se le pagó.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Influencer</Th>
                    <Th className="text-right">Acordado</Th>
                    <Th className="text-right">Pagado</Th>
                    <Th className="text-right">Pendiente</Th>
                    <Th>Estado</Th>
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
                            <span className="text-amber-700">sin acordar</span>
                          ) : (
                            formatMoney(linea.acordado, plan.currency)
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">{formatMoney(linea.pagado, plan.currency)}</Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(linea.pendiente, plan.currency)}
                        </Td>
                        <Td>
                          {linea.acordado === null ? (
                            <Badge tone="amber">Falta el cachet</Badge>
                          ) : falta !== null && falta <= 0 && linea.pagado > 0 ? (
                            <Badge tone="emerald">Saldado</Badge>
                          ) : linea.pagado > 0 ? (
                            <Badge tone="blue">Pago parcial</Badge>
                          ) : (
                            <Badge tone="slate">Sin pagar</Badge>
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
          <CardTitle>Movimientos</CardTitle>
          <p className="text-xs text-ink-500">
            Cada cobro y cada pago, con su factura. Lo cancelado no suma ni como deuda ni como pago.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {puedeEditar ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)}>
                <Plus className="size-4" aria-hidden="true" />
                {abierto ? 'Cerrar' : 'Registrar un movimiento'}
              </Button>

              {abierto ? (
                <form ref={formRef} action={crear} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-3">
                  <Field label="Qué pasó" htmlFor="direction" required>
                    <Select id="direction" name="direction" required>
                      {Object.entries(DIRECCIONES).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Monto" htmlFor="amount" required hint={`En ${plan.currency}.`}>
                    <Input id="amount" name="amount" inputMode="decimal" required />
                  </Field>
                  <Field label="Estado" htmlFor="status" required>
                    <Select id="status" name="status" defaultValue="PENDING" required>
                      <option value="PENDING">Pendiente</option>
                      <option value="PAID">Ya pagado</option>
                    </Select>
                  </Field>
                  <Field label="Concepto" htmlFor="concept" required className="sm:col-span-2">
                    <Input id="concept" name="concept" placeholder="Anticipo 50%" required maxLength={200} />
                  </Field>
                  <Field label="Influencer" htmlFor="candidacyId" hint="Si el movimiento es de alguien en particular.">
                    <Select id="candidacyId" name="candidacyId" defaultValue="">
                      <option value="">—</option>
                      {plan.talento.map((linea) => (
                        <option key={linea.candidacyId} value={linea.candidacyId}>
                          {linea.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Vence" htmlFor="dueDate">
                    <Input id="dueDate" name="dueDate" type="date" />
                  </Field>
                  <Field label="Nº de factura o comprobante" htmlFor="reference">
                    <Input id="reference" name="reference" maxLength={120} />
                  </Field>
                  <Field label="Método" htmlFor="method" hint="Transferencia, efectivo, canje…">
                    <Input id="method" name="method" maxLength={80} />
                  </Field>
                  <Field label="Factura adjunta" htmlFor="documento" hint="PDF o imagen." className="sm:col-span-2">
                    <Input
                      id="documento"
                      name="documento"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      className="h-auto py-1.5"
                    />
                  </Field>
                  <Field label="Notas" htmlFor="notes" className="sm:col-span-3">
                    <Textarea id="notes" name="notes" rows={2} />
                  </Field>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={pendiente}>
                      {pendiente ? 'Guardando…' : 'Registrar'}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {plan.movimientos.length === 0 ? (
            <p className="text-sm text-ink-500">Todavía no hay movimientos registrados.</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Concepto</Th>
                    <Th>Qué pasó</Th>
                    <Th className="text-right">Monto</Th>
                    <Th>Estado</Th>
                    <Th>Fechas</Th>
                    <Th>Factura</Th>
                    {puedeEditar ? <Th className="text-right">Acciones</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {plan.movimientos.map((movimiento) => (
                    <Tr key={movimiento.id}>
                      <Td>
                        <span className="font-medium text-ink-900">{movimiento.concept}</span>
                        {movimiento.quien ? <p className="text-xs text-ink-500">{movimiento.quien}</p> : null}
                        {movimiento.reference ? (
                          <p className="text-xs text-ink-500">Nº {movimiento.reference}</p>
                        ) : null}
                      </Td>
                      <Td className="text-xs text-ink-600">{DIRECCIONES[movimiento.direction]}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(movimiento.amount, movimiento.currency)}</Td>
                      <Td>
                        {movimiento.status === 'PAID' ? (
                          <Badge tone="emerald">Pagado</Badge>
                        ) : movimiento.status === 'CANCELLED' ? (
                          <Badge tone="slate">Cancelado</Badge>
                        ) : (
                          <Badge tone="amber">Pendiente</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {movimiento.paidAt
                          ? `Pagado ${formatDate(movimiento.paidAt)}`
                          : movimiento.dueDate
                            ? `Vence ${formatDate(movimiento.dueDate)}`
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
                            sin adjuntar
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
                                  Deshacer
                                </>
                              ) : (
                                <>
                                  <Check className="size-4" aria-hidden="true" />
                                  Pagado
                                </>
                              )}
                            </Button>
                            <ConfirmButton
                              title="Borrar el movimiento"
                              description="Esto no se deshace, y si tenía una factura adjunta también se borra. Si el pago no se hizo, marcalo como pendiente en vez de borrarlo: el historial sirve."
                              confirmLabel="Borrar"
                              onConfirm={() => borrar(movimiento.id)}
                              pending={pendiente}
                            >
                              <Button size="sm" variant="ghost" disabled={pendiente}>
                                <Trash2 className="size-4" aria-hidden="true" />
                                <span className="sr-only">Borrar</span>
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
