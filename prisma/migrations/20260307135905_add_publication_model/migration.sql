-- CreateEnum
CREATE TYPE "PublishChannel" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "channel" "PublishChannel" NOT NULL,
    "postContent" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Publication_dealId_idx" ON "Publication"("dealId");

-- CreateIndex
CREATE INDEX "Publication_channel_idx" ON "Publication"("channel");

-- CreateIndex
CREATE INDEX "Publication_publishedAt_idx" ON "Publication"("publishedAt");

-- CreateIndex
CREATE INDEX "Deal_published_rating_reviewCount_idx" ON "Deal"("published", "rating", "reviewCount");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
