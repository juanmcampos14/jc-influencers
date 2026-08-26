-- AlterEnum
ALTER TYPE "AiInsightKind" ADD VALUE 'BRAND_MURAL';

-- AlterTable
ALTER TABLE "client_brands" ADD COLUMN     "muralAlt" TEXT,
ADD COLUMN     "muralGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "muralSvg" TEXT;
