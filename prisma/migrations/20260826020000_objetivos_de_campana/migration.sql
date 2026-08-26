-- CreateEnum
CREATE TYPE "GoalMetric" AS ENUM ('ALCANCE_ESTIMADO', 'ALCANCE_REAL', 'VISUALIZACIONES', 'INTERACCIONES', 'CLICS', 'PUBLICACIONES', 'PERFILES_APROBADOS', 'INVERSION_EN_TALENTO');

-- CreateEnum
CREATE TYPE "GoalDirection" AS ENUM ('AL_MENOS', 'COMO_MUCHO');

-- CreateTable
CREATE TABLE "campaign_goals" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "metric" "GoalMetric" NOT NULL,
    "direction" "GoalDirection" NOT NULL DEFAULT 'AL_MENOS',
    "target" DECIMAL(14,2) NOT NULL,
    "rationale" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "campaign_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_goals_clientId_campaignId_idx" ON "campaign_goals"("clientId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_goals_campaignId_metric_key" ON "campaign_goals"("campaignId", "metric");

-- AddForeignKey
ALTER TABLE "campaign_goals" ADD CONSTRAINT "campaign_goals_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Aislamiento por cliente ─────────────────────────────────────────────────
-- Un objetivo puede ser interno de la agencia ("no pasarnos de tanto de
-- cachet"), así que la tabla lleva clientId y entra a la misma barrera que el
-- resto. La visibilidad hacia el cliente la decide `clientVisible`, no esta
-- política: RLS separa marcas, no roles.

ALTER TABLE "campaign_goals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "campaign_goals"
  FOR ALL
  USING (app_client_in_scope("clientId"))
  WITH CHECK (app_client_in_scope("clientId"));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "campaign_goals" TO jc_app;
  END IF;
END $$;
