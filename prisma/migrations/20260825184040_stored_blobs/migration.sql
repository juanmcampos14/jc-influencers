-- CreateTable
CREATE TABLE "stored_blobs" (
    "key" TEXT NOT NULL,
    "clientId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_blobs_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "stored_blobs_clientId_idx" ON "stored_blobs"("clientId");

-- AddForeignKey
ALTER TABLE "stored_blobs" ADD CONSTRAINT "stored_blobs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los bytes se filtran como todo lo demás: el segundo cerrojo también aplica acá.
-- Un blob sin cliente (por ahora no se crea ninguno) queda visible sólo para la
-- agencia; nunca para un usuario de cliente.
ALTER TABLE "stored_blobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "stored_blobs"
  FOR ALL
  USING ("clientId" IS NOT NULL AND app_client_in_scope("clientId") OR "clientId" IS NULL AND app_is_agency())
  WITH CHECK ("clientId" IS NOT NULL AND app_client_in_scope("clientId") OR "clientId" IS NULL AND app_is_agency());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "stored_blobs" TO jc_app;
  END IF;
END $$;
