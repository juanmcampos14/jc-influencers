import { describe, expect, it } from 'vitest'
import { leerEnlacesPegados, nombreSugerido, pareceListaDeEnlaces } from '@/lib/domain/enlaces-pegados'

/**
 * Pegar seis links de una vez.
 *
 * El riesgo que estos tests cuidan no es no entender un enlace: es entender de
 * más. `parseProfileUrl` le agrega `https://` a lo que no lo trae, así que una
 * palabra suelta también "parsea". Si eso contara como enlace, cada búsqueda
 * por nombre se volvería un intento de dar de alta a alguien.
 */
describe('leer lo que se pegó', () => {
  it('separa varios links pegados en una sola línea', () => {
    const { enlaces } = leerEnlacesPegados(
      'https://www.instagram.com/uno https://www.instagram.com/dos, https://www.tiktok.com/@tres',
    )
    expect(enlaces.map((e) => e.handle)).toEqual(['uno', 'dos', 'tres'])
  })

  it('separa los que vienen uno por línea, como se pegan de un Excel', () => {
    const { enlaces } = leerEnlacesPegados('https://www.instagram.com/uno\nhttps://www.instagram.com/dos\n')
    expect(enlaces).toHaveLength(2)
  })

  it('acepta un link sin https, que es como se copian a mano', () => {
    const { enlaces } = leerEnlacesPegados('instagram.com/moyanoflor')
    expect(enlaces[0]?.handle).toBe('moyanoflor')
    expect(enlaces[0]?.platform).toBe('INSTAGRAM')
  })

  /* El caso que define el diseño: un nombre NO es un enlace. */
  it('un nombre suelto no es un enlace', () => {
    expect(leerEnlacesPegados('moyanoflor').enlaces).toHaveLength(0)
    expect(leerEnlacesPegados('Flor Moyano').enlaces).toHaveLength(0)
    expect(pareceListaDeEnlaces('Flor Moyano')).toBe(false)
    expect(pareceListaDeEnlaces('https://www.instagram.com/moyanoflor')).toBe(true)
  })

  it('el mismo perfil pegado dos veces es una sola alta', () => {
    const { enlaces } = leerEnlacesPegados(
      'https://www.instagram.com/uno/?hl=es https://instagram.com/uno https://www.instagram.com/uno/',
    )
    expect(enlaces).toHaveLength(1)
  })

  it('ignora la puntuación pegada al final del link', () => {
    const { enlaces } = leerEnlacesPegados('mirá a https://www.instagram.com/uno, y a https://www.instagram.com/dos.')
    expect(enlaces.map((e) => e.handle)).toEqual(['uno', 'dos'])
  })

  /*
   * De una web no sale una persona. Aceptarla daría de alta a alguien llamado
   * "midominio.com", que es peor que decir que ese link no sirve.
   */
  it('un sitio cualquiera se reporta como no reconocido, no se acepta', () => {
    const leido = leerEnlacesPegados('https://midominio.com/equipo')
    expect(leido.enlaces).toHaveLength(0)
    expect(leido.noReconocidos).toEqual(['https://midominio.com/equipo'])
  })

  it('el nombre sugerido sale del handle, y sin handle del último tramo', () => {
    const { enlaces } = leerEnlacesPegados('https://www.instagram.com/moyanoflor https://www.youtube.com/c/UnCanal')
    expect(nombreSugerido(enlaces[0]!)).toBe('moyanoflor')
    expect(nombreSugerido(enlaces[1]!)).toBe('uncanal')
  })
})
