import type { FastifyInstance } from 'fastify';
import { listTransactions } from '../services/transaction.service.js';

export async function transactionRoutes(app: FastifyInstance) {
  app.get('/api/transactions', async (_request, reply) => {
    const transactions = await listTransactions();

    return reply.send({
      ok: true,
      transactions
    });
  });
}