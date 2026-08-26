import { describe, expect, it } from 'vitest'
import { proximaDireccion, resolverOrden, type ColumnaOrdenable } from '@/lib/domain/orden'

const COLUMNAS: ReadonlyArray<ColumnaOrdenable<'nombre' | 'seguidores'>> = [
  { clave: 'nombre' },
  { clave: 'seguidores', porDefecto: 'desc' },
]

describe('resolverOrden', () => {
  it('usa la primera columna cuando no se pide nada', () => {
    expect(resolverOrden(COLUMNAS, {})).toEqual({ clave: 'nombre', direccion: 'asc' })
  })

  it('respeta lo pedido cuando la columna está permitida', () => {
    expect(resolverOrden(COLUMNAS, { orden: 'seguidores', dir: 'asc' })).toEqual({
      clave: 'seguidores',
      direccion: 'asc',
    })
  })

  it('cada columna trae su dirección natural', () => {
    expect(resolverOrden(COLUMNAS, { orden: 'seguidores' }).direccion).toBe('desc')
    expect(resolverOrden(COLUMNAS, { orden: 'nombre' }).direccion).toBe('asc')
  })

  it('ignora una columna que la pantalla no declaró', () => {
    // Si esto cayera al valor pedido, un parámetro de más ordenaría por una
    // columna oculta y el orden filtraría su contenido fila por fila.
    expect(resolverOrden(COLUMNAS, { orden: 'costoInterno' })).toEqual({ clave: 'nombre', direccion: 'asc' })
    expect(resolverOrden(COLUMNAS, { orden: 'passwordHash' }).clave).toBe('nombre')
  })

  it('ignora una dirección inventada', () => {
    expect(resolverOrden(COLUMNAS, { orden: 'nombre', dir: '; drop table' }).direccion).toBe('asc')
  })

  it('toma el primer valor cuando el parámetro viene repetido', () => {
    expect(resolverOrden(COLUMNAS, { orden: ['seguidores', 'nombre'] }).clave).toBe('seguidores')
  })
})

describe('proximaDireccion', () => {
  const orden = { clave: 'nombre' as const, direccion: 'asc' as const }

  it('invierte la columna que ya está ordenando', () => {
    expect(proximaDireccion({ clave: 'nombre' }, orden)).toBe('desc')
  })

  it('estrena una columna nueva con su dirección natural', () => {
    expect(proximaDireccion({ clave: 'seguidores', porDefecto: 'desc' }, orden)).toBe('desc')
  })
})
