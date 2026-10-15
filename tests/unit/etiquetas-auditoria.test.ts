import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUDIT } from '@/lib/audit'
import { AUDIT_ACTIONS, auditActionLabel, claveDeAccion, ENTITY_TYPES } from '@/lib/domain/labels'

const IDIOMAS = ['es', 'en'] as const

const mensajes = (idioma: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../messages/${idioma}.json`, import.meta.url), 'utf8')).etiquetas

/**
 * Una auditoría existe para que alguien de afuera pueda leerla: un cliente, un
 * abogado, vos dentro de seis meses. Si falta una etiqueta se ve la clave
 * técnica, y estos tests fallan antes de que eso llegue a una pantalla.
 *
 * Desde que el producto habla dos idiomas, "tiene etiqueta" significa que la
 * tiene en los dos: faltando una, la pantalla en inglés muestra la clave.
 */
describe('Etiquetas de la auditoría', () => {
  it('toda acción registrada está en la lista de acciones conocidas', () => {
    const sinListar = Object.values(AUDIT).filter((accion) => !AUDIT_ACTIONS.includes(accion))
    expect(sinListar, `Faltan en AUDIT_ACTIONS: ${sinListar.join(', ')}`).toEqual([])
  })

  for (const idioma of IDIOMAS) {
    it(`toda acción tiene su texto en ${idioma}`, () => {
      const textos = mensajes(idioma)
      const sinTexto = AUDIT_ACTIONS.filter((accion) => !(claveDeAccion(accion) in textos))
      expect(sinTexto, `Faltan textos en ${idioma} para: ${sinTexto.join(', ')}`).toEqual([])
    })

    it(`toda entidad tiene su texto en ${idioma}`, () => {
      const textos = mensajes(idioma)
      const sinTexto = ENTITY_TYPES.filter((entidad) => !(`entidad${entidad}` in textos))
      expect(sinTexto, `Faltan textos en ${idioma} para: ${sinTexto.join(', ')}`).toEqual([])
    })
  }

  it('una clave desconocida se muestra tal cual en vez de romper', () => {
    const traductor = (clave: string) => `TRADUCIDO:${clave}`
    expect(auditActionLabel(traductor, 'algo.que.no.existe')).toBe('algo.que.no.existe')
  })

  it('los puntos de la clave técnica no se cuelan en la clave de traducción', () => {
    // Un punto en next-intl es anidamiento: `accion.auth.login` buscaría tres niveles.
    expect(claveDeAccion('auth.login.success')).toBe('accion_auth_login_success')
  })
})
