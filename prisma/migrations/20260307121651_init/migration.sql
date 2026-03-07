-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "parentAsin" TEXT,
    "title" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'IT',
    "imageSmall" TEXT,
    "imageLarge" TEXT,
    "features" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "avgPrice" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION,
    "discount" INTEGER,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "affiliateWeb" TEXT,
    "affiliateStore" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrapeRunId" TEXT NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "ScrapeRunStatus" NOT NULL DEFAULT 'RUNNING',
    "totalDeals" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_asin_key" ON "Product"("asin");

-- CreateIndex
CREATE INDEX "Product_marketplace_idx" ON "Product"("marketplace");

-- CreateIndex
CREATE INDEX "Deal_asin_idx" ON "Deal"("asin");

-- CreateIndex
CREATE INDEX "Deal_scrapeRunId_idx" ON "Deal"("scrapeRunId");

-- CreateIndex
CREATE INDEX "Deal_category_idx" ON "Deal"("category");

-- CreateIndex
CREATE INDEX "Deal_fetchedAt_idx" ON "Deal"("fetchedAt");

-- CreateIndex
CREATE INDEX "Deal_discount_idx" ON "Deal"("discount");

-- CreateIndex
CREATE INDEX "ScrapeRun_status_idx" ON "ScrapeRun"("status");

-- CreateIndex
CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_asin_fkey" FOREIGN KEY ("asin") REFERENCES "Product"("asin") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
