-- CreateEnum
CREATE TYPE "AgencyRole" AS ENUM ('PLATFORM_SUPERADMIN', 'AGENCY_ADMIN', 'ACCOUNT_MANAGER', 'SCOUT', 'FINANCE');

-- CreateEnum
CREATE TYPE "ClientRole" AS ENUM ('CLIENT_ADMIN', 'CLIENT_REVIEWER', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'BRIEFING', 'SCOUTING', 'PROPOSAL', 'NEGOTIATION', 'PRODUCTION', 'LIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignAssignmentRole" AS ENUM ('OWNER', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "BriefNicheMode" AS ENUM ('PRIORITY', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "InfluencerStatus" AS ENUM ('NEW', 'ACTIVE', 'BACKLOG', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdultStatus" AS ENUM ('CONFIRMED', 'NOT_CONFIRMED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKTREE', 'WEBSITE', 'X', 'TWITCH', 'SPOTIFY', 'FACEBOOK', 'LINKEDIN', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'STALE', 'FAILED');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('OPEN', 'DISMISSED', 'MERGED');

-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('SCREENING', 'PROPOSAL', 'NEGOTIATION', 'PRODUCTION', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClientApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'REPLACEMENT_REQUESTED');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'RESPONDED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AGREED', 'DECLINED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "DeliverableType" AS ENUM ('STORY', 'REEL', 'POST', 'TIKTOK', 'VIDEO', 'YOUTUBE_VIDEO', 'LIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'FOR_APPROVAL', 'APPROVED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL', 'CLIENT_VISIBLE', 'CLIENT_AUTHORED', 'BUDGET_PRIVATE');

-- CreateEnum
CREATE TYPE "AuthorSide" AS ENUM ('AGENCY', 'CLIENT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportOutcome" AS ENUM ('CREATED', 'UPDATED', 'UNCHANGED', 'POSSIBLE_DUPLICATE', 'INCOMPLETE', 'UNPARSEABLE', 'SECTION', 'MULTI_PERSON', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordSetAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "locale" TEXT NOT NULL DEFAULT 'es-AR',
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfSecretHash" TEXT NOT NULL,
    "activeClientId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "agencyRole" "AgencyRole",
    "clientId" TEXT,
    "clientRole" "ClientRole",
    "extraCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AgencyRole" NOT NULL,
    "extraCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "agency_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "ClientRole" NOT NULL,
    "extraCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "client_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "country" TEXT,
    "markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "website" TEXT,
    "description" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "allowClientUserInvites" BOOLEAN NOT NULL DEFAULT false,
    "allowClientExports" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budgetEstimated" DECIMAL(14,2),
    "budgetCache" DECIMAL(14,2),
    "barterDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_assignments" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CampaignAssignmentRole" NOT NULL DEFAULT 'COLLABORATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_links" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REFERENCE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_documents" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_briefs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "country" TEXT,
    "language" TEXT,
    "followersMin" INTEGER,
    "followersMax" INTEGER,
    "engagementRateMin" DECIMAL(6,3),
    "audienceAgeMin" INTEGER,
    "audienceAgeMax" INTEGER,
    "audienceGeoPredominance" TEXT,
    "audienceGeoMinPercent" INTEGER,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idealProfile" TEXT,
    "contentIdeas" TEXT,
    "realProductUses" TEXT,
    "inclusionCriteria" TEXT,
    "exclusionCriteria" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaign_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_niches" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" "BriefNicheMode" NOT NULL DEFAULT 'PRIORITY',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "idealProfile" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "brief_niches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_keywords" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "brief_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_clusters" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "targetPercent" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "brief_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencers" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "realName" TEXT,
    "primaryHandle" TEXT,
    "country" TEXT,
    "city" TEXT,
    "language" TEXT,
    "bio" TEXT,
    "status" "InfluencerStatus" NOT NULL DEFAULT 'NEW',
    "adultStatus" "AdultStatus" NOT NULL DEFAULT 'NOT_CONFIRMED',
    "representative" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactNotes" TEXT,
    "contactLegalBasis" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "influencers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "url" TEXT NOT NULL,
    "urlNormalized" TEXT NOT NULL,
    "handle" TEXT,
    "followers" INTEGER,
    "followersRaw" TEXT,
    "followersUnparsed" BOOLEAN NOT NULL DEFAULT false,
    "engagementRate" DECIMAL(6,3),
    "engagementRaw" TEXT,
    "avgViews" INTEGER,
    "audienceLocalPercent" DECIMAL(5,2),
    "audienceDemographics" JSONB,
    "metricSource" TEXT,
    "metricSourceUrl" TEXT,
    "measuredAt" TIMESTAMP(3),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "socialProfileId" TEXT NOT NULL,
    "followers" INTEGER,
    "followersRaw" TEXT,
    "engagementRate" DECIMAL(6,3),
    "avgViews" INTEGER,
    "audienceLocalPercent" DECIMAL(5,2),
    "source" TEXT,
    "sourceUrl" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedById" TEXT,
    "raw" JSONB,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niches" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "niches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_niches" (
    "influencerId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,

    CONSTRAINT "influencer_niches_pkey" PRIMARY KEY ("influencerId","nicheId")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_tags" (
    "influencerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "influencer_tags_pkey" PRIMARY KEY ("influencerId","tagId")
);

-- CreateTable
CREATE TABLE "influencer_duplicates" (
    "id" TEXT NOT NULL,
    "influencerAId" TEXT NOT NULL,
    "influencerBId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "influencer_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidacy_status_defs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "StatusCategory" NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "order" INTEGER NOT NULL DEFAULT 0,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "candidacy_status_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidacies" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "clusterId" TEXT,
    "rank" INTEGER,
    "statusKey" TEXT NOT NULL,
    "fitScore" INTEGER,
    "agencyRationale" TEXT,
    "contentIdea" TEXT,
    "deliverablesSummary" TEXT,
    "storiesCount" INTEGER NOT NULL DEFAULT 0,
    "reelsCount" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "tiktoksCount" INTEGER NOT NULL DEFAULT 0,
    "videosCount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budgetRequested" DECIMAL(14,2),
    "budgetNegotiated" DECIMAL(14,2),
    "cacheAmount" DECIMAL(14,2),
    "barterDescription" TEXT,
    "availability" "Availability" NOT NULL DEFAULT 'UNKNOWN',
    "contactStatus" "ContactStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "negotiationStatus" "NegotiationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "clientApproval" "ClientApproval" NOT NULL DEFAULT 'PENDING',
    "clientApprovalAt" TIMESTAMP(3),
    "clientApprovalById" TEXT,
    "ownerUserId" TEXT,
    "proposedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "inShortlist" BOOLEAN NOT NULL DEFAULT false,
    "shortlistOrder" INTEGER,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" TEXT,
    "budgetPrivateNotes" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "importRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "candidacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidacy_status_events" (
    "id" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromStatusKey" TEXT,
    "toStatusKey" TEXT NOT NULL,
    "comment" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidacy_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "DeliverableType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "candidacyId" TEXT,
    "authorUserId" TEXT,
    "authorSide" "AuthorSide" NOT NULL,
    "visibility" "CommentVisibility" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_references" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "influencerId" TEXT,
    "socialProfileId" TEXT,
    "candidacyId" TEXT,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supports" TEXT NOT NULL,
    "consultedAt" TIMESTAMP(3) NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "source_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "clientId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "storageKey" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_logs" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "outcome" "ImportOutcome" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT,
    "rawValues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "resource" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_email_status_idx" ON "invitations"("email", "status");

-- CreateIndex
CREATE INDEX "invitations_clientId_idx" ON "invitations"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_memberships_userId_key" ON "agency_memberships"("userId");

-- CreateIndex
CREATE INDEX "client_memberships_clientId_idx" ON "client_memberships"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_memberships_userId_clientId_key" ON "client_memberships"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_slug_key" ON "clients"("slug");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "campaigns_clientId_status_idx" ON "campaigns"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_clientId_slug_key" ON "campaigns"("clientId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_id_clientId_key" ON "campaigns"("id", "clientId");

-- CreateIndex
CREATE INDEX "campaign_assignments_clientId_idx" ON "campaign_assignments"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_assignments_campaignId_userId_key" ON "campaign_assignments"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "campaign_links_campaignId_idx" ON "campaign_links"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_documents_campaignId_idx" ON "campaign_documents"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_briefs_campaignId_key" ON "campaign_briefs"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_briefs_campaignId_clientId_key" ON "campaign_briefs"("campaignId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_briefs_id_clientId_key" ON "campaign_briefs"("id", "clientId");

-- CreateIndex
CREATE INDEX "brief_niches_briefId_idx" ON "brief_niches"("briefId");

-- CreateIndex
CREATE UNIQUE INDEX "brief_keywords_briefId_category_term_key" ON "brief_keywords"("briefId", "category", "term");

-- CreateIndex
CREATE UNIQUE INDEX "brief_clusters_briefId_key_key" ON "brief_clusters"("briefId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "brief_clusters_id_clientId_key" ON "brief_clusters"("id", "clientId");

-- CreateIndex
CREATE INDEX "influencers_status_idx" ON "influencers"("status");

-- CreateIndex
CREATE INDEX "influencers_country_idx" ON "influencers"("country");

-- CreateIndex
CREATE INDEX "social_profiles_platform_urlNormalized_idx" ON "social_profiles"("platform", "urlNormalized");

-- CreateIndex
CREATE INDEX "social_profiles_platform_handle_idx" ON "social_profiles"("platform", "handle");

-- CreateIndex
CREATE INDEX "social_profiles_followers_idx" ON "social_profiles"("followers");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_influencerId_platform_urlNormalized_key" ON "social_profiles"("influencerId", "platform", "urlNormalized");

-- CreateIndex
CREATE INDEX "metric_snapshots_socialProfileId_capturedAt_idx" ON "metric_snapshots"("socialProfileId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "niches_key_key" ON "niches"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tags_key_key" ON "tags"("key");

-- CreateIndex
CREATE INDEX "influencer_duplicates_status_idx" ON "influencer_duplicates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_duplicates_influencerAId_influencerBId_key" ON "influencer_duplicates"("influencerAId", "influencerBId");

-- CreateIndex
CREATE UNIQUE INDEX "candidacy_status_defs_key_key" ON "candidacy_status_defs"("key");

-- CreateIndex
CREATE INDEX "candidacies_clientId_campaignId_statusKey_idx" ON "candidacies"("clientId", "campaignId", "statusKey");

-- CreateIndex
CREATE INDEX "candidacies_clientId_campaignId_clientApproval_idx" ON "candidacies"("clientId", "campaignId", "clientApproval");

-- CreateIndex
CREATE INDEX "candidacies_campaignId_inShortlist_shortlistOrder_idx" ON "candidacies"("campaignId", "inShortlist", "shortlistOrder");

-- CreateIndex
CREATE INDEX "candidacies_influencerId_idx" ON "candidacies"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_campaignId_influencerId_key" ON "candidacies"("campaignId", "influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_id_clientId_key" ON "candidacies"("id", "clientId");

-- CreateIndex
CREATE INDEX "candidacy_status_events_candidacyId_createdAt_idx" ON "candidacy_status_events"("candidacyId", "createdAt");

-- CreateIndex
CREATE INDEX "deliverables_candidacyId_idx" ON "deliverables"("candidacyId");

-- CreateIndex
CREATE INDEX "comments_clientId_campaignId_createdAt_idx" ON "comments"("clientId", "campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_candidacyId_createdAt_idx" ON "comments"("candidacyId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_visibility_idx" ON "comments"("visibility");

-- CreateIndex
CREATE INDEX "source_references_influencerId_idx" ON "source_references"("influencerId");

-- CreateIndex
CREATE INDEX "source_references_candidacyId_idx" ON "source_references"("candidacyId");

-- CreateIndex
CREATE INDEX "audit_logs_occurredAt_idx" ON "audit_logs"("occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_clientId_occurredAt_idx" ON "audit_logs"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_occurredAt_idx" ON "audit_logs"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "import_runs_clientId_startedAt_idx" ON "import_runs"("clientId", "startedAt");

-- CreateIndex
CREATE INDEX "import_row_logs_importRunId_outcome_idx" ON "import_row_logs"("importRunId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_userId_resource_name_key" ON "saved_views"("userId", "resource", "name");

-- CreateIndex
CREATE INDEX "rate_limit_counters_expiresAt_idx" ON "rate_limit_counters"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_counters_bucket_windowStart_key" ON "rate_limit_counters"("bucket", "windowStart");

-- CreateIndex
CREATE INDEX "email_outbox_createdAt_idx" ON "email_outbox"("createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assignments" ADD CONSTRAINT "campaign_assignments_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assignments" ADD CONSTRAINT "campaign_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_links" ADD CONSTRAINT "campaign_links_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_documents" ADD CONSTRAINT "campaign_documents_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_briefs" ADD CONSTRAINT "campaign_briefs_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_niches" ADD CONSTRAINT "brief_niches_briefId_clientId_fkey" FOREIGN KEY ("briefId", "clientId") REFERENCES "campaign_briefs"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_keywords" ADD CONSTRAINT "brief_keywords_briefId_clientId_fkey" FOREIGN KEY ("briefId", "clientId") REFERENCES "campaign_briefs"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_clusters" ADD CONSTRAINT "brief_clusters_briefId_clientId_fkey" FOREIGN KEY ("briefId", "clientId") REFERENCES "campaign_briefs"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_socialProfileId_fkey" FOREIGN KEY ("socialProfileId") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_niches" ADD CONSTRAINT "influencer_niches_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_niches" ADD CONSTRAINT "influencer_niches_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "niches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_tags" ADD CONSTRAINT "influencer_tags_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_tags" ADD CONSTRAINT "influencer_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_duplicates" ADD CONSTRAINT "influencer_duplicates_influencerAId_fkey" FOREIGN KEY ("influencerAId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_duplicates" ADD CONSTRAINT "influencer_duplicates_influencerBId_fkey" FOREIGN KEY ("influencerBId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_clusterId_clientId_fkey" FOREIGN KEY ("clusterId", "clientId") REFERENCES "brief_clusters"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacy_status_events" ADD CONSTRAINT "candidacy_status_events_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_references" ADD CONSTRAINT "source_references_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_references" ADD CONSTRAINT "source_references_socialProfileId_fkey" FOREIGN KEY ("socialProfileId") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_references" ADD CONSTRAINT "source_references_candidacyId_clientId_fkey" FOREIGN KEY ("candidacyId", "clientId") REFERENCES "candidacies"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_campaignId_clientId_fkey" FOREIGN KEY ("campaignId", "clientId") REFERENCES "campaigns"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_logs" ADD CONSTRAINT "import_row_logs_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
