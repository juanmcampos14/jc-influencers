import { describe, expect, it } from 'vitest'
import { calcularCuentas, calcularSaldos } from '@/lib/domain/dinero'

const TERMINOS = {
  feeMode: 'PERCENT' as const,
  feePercent: 20,
  feeFixed: null,
  productionCost: null,
  adSpend: null,
}

describe('calcularCuentas', () => {
  it('suma sólo lo acordado y dice cuántos faltan', () => {
    const cuentas = calcularCuentas(TERMINOS, [{ monto: 1000 }, { monto: 500 }, { monto: null }])
    expect(cuentas.inversionEnTalento).toBe(1500)
    // El que no tiene número NO cuenta como cero: cuenta como pendiente.
    expect(cuentas.talentosSinNumero).toBe(1)
    expect(cuentas.faltaParaCotizar).toContainEqual({ clave: 'faltaCachet', valores: { cantidad: 1 } })
  })

  it('el fee por porcentaje se calcula sobre lo que hay, y lo aclara', () => {
    const cuentas = calcularCuentas(TERMINOS, [{ monto: 1000 }, { monto: null }])
    expect(cuentas.feeDeAgencia).toBe(200)
    expect(cuentas.explicacionDelFee).toEqual({
      clave: 'feePorcentajeParcial',
      valores: { pct: 20, conNumero: 1 },
    })
  })

  it('sin porcentaje definido no inventa un fee de cero', () => {
    const cuentas = calcularCuentas({ ...TERMINOS, feePercent: null }, [{ monto: 1000 }])
    expect(cuentas.feeDeAgencia).toBeNull()
    expect(cuentas.totalAlCliente).toBeNull()
    expect(cuentas.faltaParaCotizar).toContainEqual({ clave: 'faltaPorcentaje' })
  })

  it('el monto fijo no depende de la inversión', () => {
    const cuentas = calcularCuentas(
      { feeMode: 'FIXED', feePercent: null, feeFixed: 3000, productionCost: null, adSpend: null },
      [{ monto: 100 }],
    )
    expect(cuentas.feeDeAgencia).toBe(3000)
    expect(cuentas.totalAlCliente).toBe(3100)
  })

  it('sin fee, el total es la inversión más los costos', () => {
    const cuentas = calcularCuentas(
      { feeMode: 'NONE', feePercent: null, feeFixed: null, productionCost: 200, adSpend: 300 },
      [{ monto: 1000 }],
    )
    expect(cuentas.feeDeAgencia).toBe(0)
    expect(cuentas.totalAlCliente).toBe(1500)
    expect(cuentas.faltaParaCotizar).toEqual([])
  })

  it('una campaña sin nadie cargado no vale cero: no se puede cotizar todavía', () => {
    const cuentas = calcularCuentas(TERMINOS, [])
    expect(cuentas.inversionEnTalento).toBe(0)
    expect(cuentas.totalAlCliente).toBe(0)
    // Con cero perfiles no falta nada que declarar: el vacío es real, no un hueco.
    expect(cuentas.faltaParaCotizar).toEqual([])
  })
})

describe('calcularSaldos', () => {
  it('separa lo pagado de lo pendiente en cada dirección', () => {
    const saldos = calcularSaldos([
      { direction: 'AGENCY_IN', status: 'PAID', amount: 1000 },
      { direction: 'AGENCY_IN', status: 'PENDING', amount: 500 },
      { direction: 'TALENT_OUT', status: 'PAID', amount: 300 },
    ])
    expect(saldos.AGENCY_IN).toEqual({ pagado: 1000, pendiente: 500, total: 1500 })
    expect(saldos.TALENT_OUT).toEqual({ pagado: 300, pendiente: 0, total: 300 })
    expect(saldos.EXPENSE_OUT.total).toBe(0)
  })

  it('lo cancelado no es deuda ni es pago', () => {
    // Si lo cancelado sumara al pendiente, una campaña saldada figuraría con
    // deuda para siempre.
    const saldos = calcularSaldos([
      { direction: 'TALENT_OUT', status: 'CANCELLED', amount: 900 },
      { direction: 'TALENT_OUT', status: 'PAID', amount: 100 },
    ])
    expect(saldos.TALENT_OUT).toEqual({ pagado: 100, pendiente: 0, total: 100 })
  })
})
