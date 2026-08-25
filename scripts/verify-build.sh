#!/usr/bin/env bash
# Comprueba que el proyecto compile SIN variables de entorno, que es la
# condición real del build de Vercel cuando todavía no están cargadas.
#
# Dos fallas ya se colaron por no probar esto: el cliente Prisma creándose al
# importar el módulo, y prisma.config.ts exigiendo la URL de migraciones.
set -euo pipefail
cd "$(dirname "$0")/.."

RESTAURAR=0
# Pase lo que pase (incluido Ctrl-C), .env vuelve a su lugar.
restaurar() {
  if [ "$RESTAURAR" = "1" ] && [ -f .env.verify-build ]; then
    mv .env.verify-build .env
  fi
}
trap restaurar EXIT INT TERM

if [ -f .env ]; then
  mv .env .env.verify-build
  RESTAURAR=1
fi

# Un servidor de desarrollo corriendo escribe en .next mientras se borra, así
# que el borrado falla y la comprobación queda contaminada con artefactos
# viejos. Se corta acá en vez de dar un "OK" que no vale.
if ! rm -rf .next 2>/dev/null || [ -d .next ]; then
  echo "FALLA: no se pudo limpiar .next. ¿Hay un servidor de desarrollo corriendo? Pará el dev y volvé a intentar."
  exit 1
fi

echo "→ Compilando sin ninguna variable de entorno…"
if npm run build; then
  echo
  echo "OK: compila sin variables de entorno."
else
  echo
  echo "FALLA: el build necesita variables que en Vercel no van a estar durante la compilación."
  exit 1
fi
