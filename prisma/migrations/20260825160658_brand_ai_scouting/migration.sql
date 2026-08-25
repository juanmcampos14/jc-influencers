-- CreateEnum
CREATE TYPE "BrandSource" AS ENUM ('WEBSITE', 'INSTAGRAM', 'UPLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "AiInsightKind" AS ENUM ('PROFILE_FIT', 'CREATIVE_IDEAS', 'CAMPAIGN_ANALYSIS', 'CAMPAIGN_REPORT');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('RUNNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ScoutingMode" AS ENUM ('DISCOVER', 'ENRICH');

-- CreateEnum
CREATE TYPE "ScoutingStatus" AS ENUM ('PREVIEW', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "client_brands" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "source" "BrandSource" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "extractedAt" TIMESTAMP(3),
    "rawExtraction" JSONB,
    "logoStorageKey" TEXT,
    "logoContentType" TEXT,
    "logoIsDark" BOOLEAN NOT NULL DEFAULT false,
    "faviconStorageKey" TEXT,
    "primary" TEXT NOT NULL DEFAULT '#3b5bdb',
    "onPrimary" TEXT NOT NULL DEFAULT '#ffffff',
    "accent" TEXT NOT NULL DEFAULT '#5c7cfa',
    "background" TEXT NOT NULL DEFAULT '#f8f9fb',
    "surface" TEXT NOT NULL DEFAULT '#ffffff',
    "text" TEXT NOT NULL DEFAULT '#171a21',
    "muted" TEXT NOT NULL DEFAULT '#5b6270',
    "border" TEXT NOT NULL DEFAULT '#e2e6ee',
    "fontHeading" TEXT,
    "fontBody" TEXT,
    "radius" INTEGER NOT NULL DEFAULT 12,
    "mode" "ThemeMode" NOT NULL DEFAULT 'LIGHT',
    "safeMode" BOOLEAN NOT NULL DEFAULT false,
    "contrastReport" JSONB,
    "status" "BrandStatus" NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "client_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "candidacyId" TEXT,
    "kind" "AiInsightKind" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'RUNNING',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputsSummary" JSONB NOT NULL,
    "inputsDigest" TEXT NOT NULL,
    "output" JSONB,
    "outputText" TEXT,
    "errorMessage" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(12,6),
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scouting_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "provider" TEXT NOT NULL,
    "mode" "ScoutingMode" NOT NULL,
    "platform" "Platform" NOT NULL,
    "query" JSONB NOT NULL,
    "status" "ScoutingStatus" NOT NULL DEFAULT 'PREVIEW',
    "requestedRecords" INTEGER NOT NULL DEFAULT 0,
    "deliveredRecords" INTEGER NOT NULL DEFAULT 0,
    "unitCostUsd" DECIMAL(12,6) NOT NULL,
    "estimatedCostUsd" DECIMAL(12,4) NOT NULL,
    "actualCostUsd" DECIMAL(12,4),
    "externalJobId" TEXT,
    "errorMessage" TEXT,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "scouting_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scouting_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT,
    "url" TEXT NOT NULL,
    "urlNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "followers" INTEGER,
    "engagementRate" DECIMAL(6,3),
    "country" TEXT,
    "bio" TEXT,
    "raw" JSONB,
    "matchedInfluencerId" TEXT,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3),
    "discarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scouting_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scouting_budgets" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "period" TEXT NOT NULL,
    "limitUsd" DECIMAL(12,2) NOT NULL,
    "spentUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "scouting_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_brands_clientId_key" ON "client_brands"("clientId");

-- CreateIndex
CREATE INDEX "ai_insights_clientId_kind_createdAt_idx" ON "ai_insights"("clientId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_campaignId_kind_idx" ON "ai_insights"("campaignId", "kind");

-- CreateIndex
CREATE INDEX "ai_insights_inputsDigest_idx" ON "ai_insights"("inputsDigest");

-- CreateIndex
CREATE INDEX "scouting_runs_clientId_startedAt_idx" ON "scouting_runs"("clientId", "startedAt");

-- CreateIndex
CREATE INDEX "scouting_runs_status_idx" ON "scouting_runs"("status");

-- CreateIndex
CREATE INDEX "scouting_results_clientId_imported_idx" ON "scouting_results"("clientId", "imported");

-- CreateIndex
CREATE UNIQUE INDEX "scouting_results_runId_urlNormalized_key" ON "scouting_results"("runId", "urlNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "scouting_budgets_clientId_period_key" ON "scouting_budgets"("clientId", "period");

-- AddForeignKey
ALTER TABLE "client_brands" ADD CONSTRAINT "client_brands_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouting_runs" ADD CONSTRAINT "scouting_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouting_runs" ADD CONSTRAINT "scouting_runs_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouting_results" ADD CONSTRAINT "scouting_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "scouting_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouting_budgets" ADD CONSTRAINT "scouting_budgets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
