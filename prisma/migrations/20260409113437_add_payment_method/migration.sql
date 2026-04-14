/*
  Warnings:

  - You are about to drop the `FinancialMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "FinancialMessage";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "financialMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "amount" REAL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "paymentMethod" TEXT,
    "installment" INTEGER,
    "totalInstallments" INTEGER,
    "occurredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
