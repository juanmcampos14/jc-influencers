#!/usr/bin/env bash
# Puesta en marcha de desarrollo, de cero a aplicación andando.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "→ Creando .env a partir de .env.example"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 48 | tr -d '\n')"
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
    else
      sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
    fi
    echo "→ SESSION_SECRET generado"
  else
    echo "!  openssl no está disponible: poné un SESSION_SECRET a mano en .env"
  fi
fi

echo "→ Levantando PostgreSQL"
docker compose up -d db

echo "→ Esperando a que la base acepte conexiones"
for _ in $(seq 1 40); do
  if docker exec jc_influencers_db pg_isready -U jc_owner -d jc_influencers >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "→ Generando el cliente de Prisma"
npx prisma generate

echo "→ Aplicando migraciones"
npx prisma migrate deploy

echo "→ Cargando datos de demostración"
npm run db:seed

echo
echo "Listo. Arrancá con:  npm run dev"
echo "Entrá en http://localhost:3100 con admin@jcmarketing.digital"
