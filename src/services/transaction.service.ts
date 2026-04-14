import { prisma } from '../db/prisma.js';
import type { ParsedMessage } from './parser.service.js';

export async function createTransactionFromParsed(parsed: ParsedMessage) {
  if (parsed.amount === null) {
    throw new Error('Valor não identificado na mensagem.');
  }

  if (parsed.type === 'unknown') {
    throw new Error('Tipo da movimentação não identificado.');
  }

  const transaction = await prisma.transaction.create({
    data: {
      originalText: parsed.originalText,
      normalizedText: parsed.normalizedText,
      type: parsed.type,
      category: parsed.category,
      description: parsed.description,
      amount: parsed.amount,
      installments: parsed.installments,
      source: 'manual'
    }
  });

  return transaction;
}

export async function listTransactions() {
  return prisma.transaction.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });
}