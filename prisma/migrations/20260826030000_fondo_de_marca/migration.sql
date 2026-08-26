-- Fondo de marca: la imagen real del sitio del cliente.
--
-- Los bytes viven en `stored_blobs` (con su propia política de aislamiento);
-- acá va sólo la referencia, de dónde salió y cuánto se atenúa.

ALTER TABLE "client_brands"
  ADD COLUMN IF NOT EXISTS "backdropStorageKey"  TEXT,
  ADD COLUMN IF NOT EXISTS "backdropContentType" TEXT,
  ADD COLUMN IF NOT EXISTS "backdropSourceUrl"   TEXT,
  ADD COLUMN IF NOT EXISTS "backdropOpacity"     INTEGER;
