/**
 * Las cuentas de una campaña.
 *
 * Una sola regla, y de ella salen todas las demás: **nada que no esté cargado
 * se suma como cero**. Un cachet sin negociar no es un cachet de cero, y un fee
 * que nadie definió no es un fee del 0%. La diferencia entre "no hay dato" y
 * "es cero" es toda la diferencia entre una cotización y una fantasía, así que
 * cada total viaja con la cuenta de cuántos datos le faltan.
 */

export type ModoDeFee = 'PERCENT' | 'FIXED' | 'NONE'

export type TerminosDeCampana = {
  feeMode: ModoDeFee
  feePercent: number | null
  feeFixed: number | null
  productionCost: number | null
  adSpend: number | null
}

export type LineaDeTalento = {
  /** Lo acordado con este influencer. Null significa "todavía no se acordó". */
  monto: number | null
}

export type Cuentas = {
  /** Suma de lo acordado con los influencers que YA tienen número. */
  inversionEnTalento: number
  /** Cuántos influencers todavía no tienen número acordado. */
  talentosSinNumero: number
  produccion: number | null
  pauta: number | null
  /** Lo que cobra la agencia, o null si el modo elegido no permite calcularlo. */
  feeDeAgencia: number | null
  /** Cómo se explica ese fee, en una frase. */
  explicacionDelFee: string
  /** Lo que el cliente paga en total, o null si falta algo para saberlo. */
  totalAlCliente: number | null
  /** Qué falta para que `totalAlCliente` sea un número y no una estimación. */
  faltaParaCotizar: string[]
}

const sumar = (valores: Array<number | null>): number =>
  valores.reduce<number>((total, valor) => total + (valor ?? 0), 0)

export function calcularCuentas(terminos: TerminosDeCampana, lineas: LineaDeTalento[]): Cuentas {
  const conNumero = lineas.filter((linea) => linea.monto !== null)
  const inversionEnTalento = sumar(conNumero.map((linea) => linea.monto))
  const talentosSinNumero = lineas.length - conNumero.length

  const faltaParaCotizar: string[] = []
  if (talentosSinNumero > 0) {
    faltaParaCotizar.push(
      `${talentosSinNumero} ${talentosSinNumero === 1 ? 'perfil' : 'perfiles'} sin cachet acordado`,
    )
  }

  let feeDeAgencia: number | null = null
  let explicacionDelFee = ''

  switch (terminos.feeMode) {
    case 'PERCENT':
      if (terminos.feePercent === null) {
        explicacionDelFee = 'Falta definir el porcentaje.'
        faltaParaCotizar.push('el porcentaje de la agencia')
      } else {
        feeDeAgencia = (inversionEnTalento * terminos.feePercent) / 100
        explicacionDelFee = `${terminos.feePercent}% sobre la inversión en talento`
        if (talentosSinNumero > 0) {
          // El fee se calcula sobre lo que hay. Se dice, porque va a crecer.
          explicacionDelFee += ` (sobre los ${conNumero.length} que ya tienen número)`
        }
      }
      break
    case 'FIXED':
      if (terminos.feeFixed === null) {
        explicacionDelFee = 'Falta definir el monto.'
        faltaParaCotizar.push('el monto fijo de la agencia')
      } else {
        feeDeAgencia = terminos.feeFixed
        explicacionDelFee = 'Monto fijo, no depende de la inversión'
      }
      break
    case 'NONE':
      feeDeAgencia = 0
      explicacionDelFee = 'Sin fee en esta campaña'
      break
  }

  const totalAlCliente =
    feeDeAgencia === null
      ? null
      : inversionEnTalento + feeDeAgencia + (terminos.productionCost ?? 0) + (terminos.adSpend ?? 0)

  return {
    inversionEnTalento,
    talentosSinNumero,
    produccion: terminos.productionCost,
    pauta: terminos.adSpend,
    feeDeAgencia,
    explicacionDelFee,
    totalAlCliente,
    faltaParaCotizar,
  }
}

// ── Estado de cobranza ──────────────────────────────────────────────────────

export type MovimientoParaSaldo = {
  direction: 'AGENCY_IN' | 'TALENT_OUT' | 'EXPENSE_OUT'
  status: 'PENDING' | 'PAID' | 'CANCELLED'
  amount: number
}

export type Saldo = {
  /** Anotado y todavía sin pagar. */
  pendiente: number
  /** Ya pagado. */
  pagado: number
  total: number
}

const saldoVacio = (): Saldo => ({ pendiente: 0, pagado: 0, total: 0 })

/**
 * Cuánto entró y cuánto salió, por dirección.
 *
 * Lo cancelado no se cuenta en ningún lado: no es plata pendiente ni plata
 * pagada, es un movimiento que se dio de baja. Sumarlo al pendiente haría que
 * una campaña saldada figure con deuda para siempre.
 */
export function calcularSaldos(movimientos: MovimientoParaSaldo[]): Record<MovimientoParaSaldo['direction'], Saldo> {
  const saldos: Record<MovimientoParaSaldo['direction'], Saldo> = {
    AGENCY_IN: saldoVacio(),
    TALENT_OUT: saldoVacio(),
    EXPENSE_OUT: saldoVacio(),
  }

  for (const movimiento of movimientos) {
    if (movimiento.status === 'CANCELLED') continue
    const saldo = saldos[movimiento.direction]
    if (movimiento.status === 'PAID') saldo.pagado += movimiento.amount
    else saldo.pendiente += movimiento.amount
    saldo.total += movimiento.amount
  }

  return saldos
}
