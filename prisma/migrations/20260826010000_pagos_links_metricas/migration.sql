-- CreateEnum
CREATE TYPE "MetricsSource" AS ENUM ('MANUAL', 'SCREENSHOT', 'PROVIDER');

-- CreateEnum
CREATE TYPE "AgencyFeeMode" AS ENUM ('PERCENT', 'FIXED', 'NONE');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('AGENCY_IN', 'TALENT_OUT', 'EXPENSE_OUT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "deliverables" ADD COLUMN     "comments" INTEGER,
ADD COLUMN     "likes" INTEGER,
ADD COLUMN     "measuredAt" TIMESTAMP(3),
ADD COLUMN     "metricsSource" "MetricsSource",
ADD COLUMN     "reach" INTEGER,
ADD COLUMN     "saves" INTEGER,
ADD COLUMN     "shares" INTEGER,
ADD COLUMN     "views" INTEGER;

-- CreateTable
CREATE TABLE "campaign_finances" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "feeMode" "AgencyFeeMode" NOT NULL DEFAULT 'PERCENT',
    "feePercent" DECIMAL(6,3),
    "feeFixed" DECIMAL(14,2),
    "productionCost" DECIMAL(14,2),
    "adSpend" DECIMAL(14,2),
    "terms" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaign_finances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "candidacyId" TEXT,
    "direction" "PaymentDirection" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "concept" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "documentKey" TEXT,
    "documentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_links" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "candidacyId" TEXT,
    "slug" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "label" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "tracked_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_clicks" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitorHash" TEXT NOT NULL,
    "referrerHost" TEXT,
    "country" TEXT,
    "bot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_finances_campaignId_key" ON "campaign_finances"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_finances_clientId_idx" ON "campaign_finances"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_finances_campaignId_clientId_key" ON "campaign_finances"("campaignId", "clientId");

-- CreateIndex
CREATE INDEX "payments_clientId_campaignId_direction_idx" ON "payments"("clientId", "campaignId", "direction");

-- CreateIndex
CREATE INDEX "payments_clientId_campaignId_status_idx" ON "payments"("clientId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "payments_candidacyId_idx" ON "payments"("candidacyId");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_links_slug_key" ON "tracked_links"("slug");

-- CreateIndex
CREATE INDEX "tracked_links_clientId_campaignId_idx" ON "tracked_links"("clientId", "campaignId");

-- CreateIndex
CREATE INDEX "tracked_links_candidacyId_idx" ON "tracked_links"("candidacyId");

-- CreateIndex
CREATE INDEX "link_clicks_linkId_at_idx" ON "link_clicks"("linkId", "at");

-- CreateIndex
CREATE INDEX "link_clicks_clientId_idx" ON "link_clicks"("clientId");

-- AddForeignKey
ALTER TABLE "campaign_finances" ADD CONSTRAINT "campaign_finances_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "tracked_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Aislamiento por cliente ─────────────────────────────────────────────────
--
-- Estas cuatro tablas llevan plata y métricas de un cliente, así que entran a
-- la misma barrera que el resto: la política de la base, no la del código. Un
-- error en un `where` de TypeScript no puede alcanzar para ver los pagos de
-- otra marca.
--
-- `link_clicks` no tiene relación directa con la campaña, pero sí `clientId`:
-- se aísla igual, porque un clic dice que alguien entró desde el posteo de un
-- influencer de esa marca.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaign_finances','payments','tracked_links','link_clicks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        FOR ALL
        USING (app_client_in_scope("clientId"))
        WITH CHECK (app_client_in_scope("clientId"))
    $p$, t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    FOREACH t IN ARRAY ARRAY['campaign_finances','payments','tracked_links','link_clicks'] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO jc_app', t);
    END LOOP;
  END IF;
END $$;
