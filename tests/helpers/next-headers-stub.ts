/** Stub de `next/headers` para tests: la capa de repositorios nunca lo usa. */
export async function headers(): Promise<Headers> {
  return new Headers()
}

export async function cookies() {
  const store = new Map<string, string>()
  return {
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) as string } : undefined),
    set: (name: string, value: string) => store.set(name, value),
    delete: (name: string) => store.delete(name),
  }
}
