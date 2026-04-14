-- CreateTable
CREATE TABLE "FinancialMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "amount" REAL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "installment" INTEGER,
    "totalInstallments" INTEGER,
    "occurredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
