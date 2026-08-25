import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentSecurityPolicy } from '@/lib/security/csp'

afterEach(() => {
  vi.unstubAllEnvs()
})

function withNodeEnv(value: string) {
  vi.stubEnv('NODE_ENV', value as 'production' | 'development')
}

function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `))
  if (!found) throw new Error(`La política no declara ${name}: ${policy}`)
  return found
}

describe('política de seguridad de contenido', () => {
  it('en producción lleva el nonce del pedido', () => {
    withNodeEnv('production')
    const script = directive(contentSecurityPolicy('abc123'), 'script-src')
    expect(script).toContain("'nonce-abc123'")
  })

  it('en producción nunca habilita scripts inline sin nonce', () => {
    withNodeEnv('production')
    const script = directive(contentSecurityPolicy('abc123'), 'script-src')
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
  })

  it("acompaña el nonce con 'strict-dynamic' para que Next cargue sus chunks", () => {
    // Sin esto los scripts con nonce no pueden pedir los suyos y la aplicación
    // queda a medio arrancar: el HTML llega, React no.
    withNodeEnv('production')
    expect(directive(contentSecurityPolicy('abc123'), 'script-src')).toContain("'strict-dynamic'")
  })

  it('mantiene el resto de las restricciones', () => {
    withNodeEnv('production')
    const policy = contentSecurityPolicy('abc123')
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("form-action 'self'")
    expect(policy).toContain("default-src 'self'")
  })

  it('en desarrollo permite lo que necesita el refresco en caliente', () => {
    withNodeEnv('development')
    const script = directive(contentSecurityPolicy(), 'script-src')
    expect(script).toContain("'unsafe-eval'")
  })
})
