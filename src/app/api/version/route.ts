import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Qué commit está corriendo.
 *
 * Existe por una fricción concreta y repetida: después de un push no había
 * forma de saber si el deploy ya había llegado. Todo lo que cuelga de una ruta
 * protegida redirige al login, así que responde igual antes y después, y había
 * que adivinar o pedirle a alguien que mirara una pantalla.
 *
 * No pide sesión y no revela nada: el hash del commit es público --el
 * repositorio lo es para quien tiene acceso-- y no dice nada de los datos. A
 * cambio, "¿ya está desplegado?" se contesta con una llamada.
 */
export function GET() {
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'desconocido',
      rama: process.env.VERCEL_GIT_COMMIT_REF ?? 'desconocida',
      entorno: process.env.VERCEL_ENV ?? 'local',
      /* Cuándo se construyó, no cuándo se pregunta: es lo que identifica al deploy. */
      construido: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
