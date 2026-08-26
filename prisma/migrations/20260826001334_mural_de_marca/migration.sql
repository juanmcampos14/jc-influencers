-- Mural de marca: ilustración que dibuja la IA para el espacio de cada cliente.
--
-- Se escribió idempotente a propósito. En producción estas columnas ya se
-- aplicaron a mano desde el editor de Supabase, así que `_prisma_migrations` no
-- tiene la fila correspondiente; sin los `IF NOT EXISTS`, el próximo
-- `migrate deploy` fallaría con "la columna ya existe" sobre una base que en
-- realidad está bien.

ALTER TYPE "AiInsightKind" ADD VALUE IF NOT EXISTS 'BRAND_MURAL';

ALTER TABLE "client_brands"
  ADD COLUMN IF NOT EXISTS "muralSvg" TEXT,
  ADD COLUMN IF NOT EXISTS "muralAlt" TEXT,
  ADD COLUMN IF NOT EXISTS "muralGeneratedAt" TIMESTAMP(3);
