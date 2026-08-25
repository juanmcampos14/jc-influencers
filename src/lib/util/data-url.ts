/**
 * Convierte un `data:` URI en un File, sin pasar por la red.
 *
 * La forma corta —`await (await fetch(dataUrl)).blob()`— parece equivalente y
 * no lo es: `fetch()` está gobernado por `connect-src`, y nuestra política de
 * contenido sólo permite `'self'`. En producción el navegador rechaza el
 * pedido con un `TypeError: Failed to fetch` que, disparado dentro de una
 * transición de React, tira la pantalla entera a la frontera de error.
 *
 * Decodificar a mano no toca la red, así que no depende de la política.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const coma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || coma === -1) {
    throw new Error('No es un data URI válido.')
  }

  const encabezado = dataUrl.slice(5, coma)
  const esBase64 = encabezado.endsWith(';base64')
  const contentType = (esBase64 ? encabezado.slice(0, -';base64'.length) : encabezado) || 'image/png'
  const cuerpo = dataUrl.slice(coma + 1)

  const bytes = esBase64
    ? Uint8Array.from(atob(cuerpo), (caracter) => caracter.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(cuerpo))

  return new File([bytes], filename, { type: contentType })
}
