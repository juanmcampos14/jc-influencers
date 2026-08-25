import { describe, expect, it } from 'vitest'
import { AUDIT } from '@/lib/audit'
import { AUDIT_ACTION_LABELS, auditActionLabel } from '@/lib/domain/labels'

/**
 * Una auditoría existe para que alguien de afuera pueda leerla: un cliente, un
 * abogado, vos dentro de seis meses. Si falta una etiqueta se ve la clave
 * técnica, y este test falla antes de que eso llegue a una pantalla.
 */
describe('Etiquetas de la auditoría', () => {
  it('toda acción registrada tiene su texto en castellano', () => {
    const sinEtiqueta = Object.values(AUDIT).filter((accion) => !(accion in AUDIT_ACTION_LABELS))
    expect(sinEtiqueta, `Faltan etiquetas para: ${sinEtiqueta.join(', ')}`).toEqual([])
  })

  it('una clave desconocida se muestra tal cual en vez de romper', () => {
    expect(auditActionLabel('algo.que.no.existe')).toBe('algo.que.no.existe')
  })
})
