import { beforeAll, describe, expect, it } from 'vitest'
import { fileStorage, UnsupportedFileError } from '@/lib/ports/storage'
import { withScope } from '@/lib/db/scope'
import { createClientTenant, resetDatabase, seedCatalogs } from '../helpers/fixtures'

/**
 * Los archivos viven en la base. Estos tests fijan las dos cosas que importan:
 * que vuelvan intactos, y que un cliente no pueda leer los del otro.
 */
describe('Almacenamiento de archivos', () => {
  let clienteA: string
  let clienteB: string

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    clienteA = (await createClientTenant('Alfa')).id
    clienteB = (await createClientTenant('Beta')).id
  })

  it('guarda y devuelve los bytes exactos', async () => {
    // Bytes que no sobreviven a un round-trip por texto.
    const datos = Buffer.concat([
      Buffer.from('acentos ñ á ü y un guión largo —', 'utf8'),
      Buffer.from([0x00, 0xff, 0x1b, 0x7f]),
    ])
    const guardado = await fileStorage().put({
      filename: 'logo.png',
      contentType: 'image/png',
      data: datos,
      prefix: `marca/${clienteA}`,
      clientId: clienteA,
    })

    expect(guardado.size).toBe(datos.byteLength)
    const vuelta = await fileStorage().get(guardado.key, { clientId: clienteA })
    expect(vuelta.equals(datos)).toBe(true)
  })

  it('no deja leer el archivo de otro cliente', async () => {
    const guardado = await fileStorage().put({
      filename: 'privado.png',
      contentType: 'image/png',
      data: Buffer.from('secreto de Alfa'),
      prefix: `marca/${clienteA}`,
      clientId: clienteA,
    })

    // Segundo cerrojo: aun conociendo la clave exacta, con el alcance del otro
    // cliente la fila no existe.
    const visto = await withScope({ userId: null, scope: 'client', clientIds: [clienteB], allClients: false }, (tx) =>
      tx.storedBlob.findUnique({ where: { key: guardado.key }, select: { key: true } }),
    )
    expect(visto).toBeNull()

    const propio = await withScope({ userId: null, scope: 'client', clientIds: [clienteA], allClients: false }, (tx) =>
      tx.storedBlob.findUnique({ where: { key: guardado.key }, select: { key: true } }),
    )
    expect(propio).not.toBeNull()

    // Y por la puerta de entrada real: con el dueño equivocado tampoco sale.
    await expect(fileStorage().get(guardado.key, { clientId: clienteB })).rejects.toBeInstanceOf(UnsupportedFileError)
    await expect(fileStorage().get(guardado.key, { clientId: clienteA })).resolves.toBeInstanceOf(Buffer)
  })

  it('rechaza lo que no debería guardar', async () => {
    await expect(
      fileStorage().put({
        filename: 'script.svg',
        contentType: 'image/svg+xml',
        data: Buffer.from('<svg onload="alert(1)"/>'),
        clientId: clienteA,
      }),
    ).rejects.toBeInstanceOf(UnsupportedFileError)

    await expect(
      fileStorage().put({
        filename: 'planilla.xlsx',
        contentType: 'image/png',
        data: Buffer.from('mentira'),
        clientId: clienteA,
      }),
    ).rejects.toBeInstanceOf(UnsupportedFileError)
  })

  it('borra de verdad', async () => {
    const guardado = await fileStorage().put({
      filename: 'temporal.png',
      contentType: 'image/png',
      data: Buffer.from('efimero'),
      clientId: clienteA,
    })
    await fileStorage().remove(guardado.key, { clientId: clienteA })
    await expect(fileStorage().get(guardado.key, { clientId: clienteA })).rejects.toBeInstanceOf(UnsupportedFileError)
  })
})
