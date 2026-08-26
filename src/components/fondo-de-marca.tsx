import type { CSSProperties } from 'react'
import { cn } from '@/lib/util/format'

/**
 * El fondo del espacio de un cliente.
 *
 * Puede ser una imagen real de su sitio --la foto de producto, la escena de la
 * portada-- o, si no hay ninguna usable, el mural que dibuja la IA. La imagen
 * gana siempre: reconoce a la marca mejor que cualquier ilustración inventada.
 *
 * **El tratamiento de color no es un filtro bonito, es lo que hace que la
 * imagen pertenezca a la pantalla.** Una foto puesta tal cual mete su propia
 * paleta --el verde de Kast, el rojo de otra marca-- y pelea contra los colores
 * del espacio. Acá se la pinta con el color de la marca (`luminosity` sobre una
 * capa del color primario): quedan las formas y la luz de la foto, con la
 * paleta que ya está aplicada. Después se atenúa y se desvanece hacia el texto.
 *
 * Es DECORACIÓN: va detrás de todo, no recibe clics y sale del árbol de
 * accesibilidad. Describírsela a un lector de pantalla sería ruido, no ayuda.
 */
export function FondoDeMarca({
  imagenUrl,
  muralUrl,
  opacidad,
  className,
}: {
  /** Imagen del sitio del cliente. Tiene prioridad sobre el mural. */
  imagenUrl: string | null
  /** Mural dibujado por IA, como data URI. Sólo se usa si no hay imagen. */
  muralUrl: string | null
  /** De 4 a 30. La agencia lo ajusta mirando la previsualización. */
  opacidad: number
  className?: string
}) {
  if (imagenUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-0 w-[min(58vw,900px)] select-none overflow-hidden',
          className,
        )}
        style={
          {
            opacity: Math.min(30, Math.max(4, opacidad)) / 100,
            // Se desvanece hacia la izquierda, que es donde vive el texto.
            maskImage: 'linear-gradient(to right, transparent 0%, #000 45%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 45%)',
          } as CSSProperties
        }
      >
        <span className="block size-full" style={{ backgroundColor: 'var(--jc-primary)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenUrl}
            alt=""
            className="size-full object-cover"
            style={{ mixBlendMode: 'luminosity' }}
          />
        </span>
      </span>
    )
  }

  if (!muralUrl) return null

  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[min(52vw,760px)] select-none items-center justify-center overflow-hidden lg:flex',
        className,
      )}
    >
      {/*
        * El desvanecido no es un adorno: si el modelo pinta una placa de fondo
        * de borde a borde, sin esto se ve el rectángulo recortado encima del
        * fondo del cliente. La máscara lo disuelve pase lo que pase.
        */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={muralUrl}
        alt=""
        className="size-full max-h-[80vh] object-contain opacity-[0.07] dark:opacity-[0.10]"
        style={{
          maskImage: 'radial-gradient(closest-side, #000 55%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(closest-side, #000 55%, transparent 100%)',
        }}
      />
    </span>
  )
}
