-- CreateTable
CREATE TABLE "agency_client_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "agency_client_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agency_client_assignments_clientId_idx" ON "agency_client_assignments"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_client_assignments_userId_clientId_key" ON "agency_client_assignments"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "agency_client_assignments" ADD CONSTRAINT "agency_client_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_client_assignments" ADD CONSTRAINT "agency_client_assignments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
