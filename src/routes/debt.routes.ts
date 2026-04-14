import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/prisma"

function normalizeDateOnly(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function resolveDebtStatus(dueDate: Date | null, amountPaid: number, totalAmount: number) {
  if (amountPaid >= totalAmount) {
    return "paid"
  }

  if (!dueDate) {
    return "open"
  }

  const today = startOfToday()
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)

  if (due.getTime() < today.getTime()) {
    return "overdue"
  }

  return "open"
}

export async function debtRoutes(app: FastifyInstance) {
  app.get("/debts", async () => {
    if (!("debt" in prisma) || !prisma.debt) {
      return {
        ok: false,
        data: [],
        message:
          "Modelo Debt não encontrado no Prisma Client. Rode: npx prisma migrate dev --name debts_module && npx prisma generate e reinicie o backend.",
      }
    }

    const debts = await prisma.debt.findMany({
      orderBy: [
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    })

    const refreshed = await Promise.all(
      debts.map(async (item) => {
        const nextStatus = resolveDebtStatus(item.dueDate, Number(item.amountPaid || 0), Number(item.totalAmount || 0))

        if (nextStatus !== item.status) {
          return prisma.debt.update({
            where: { id: item.id },
            data: { status: nextStatus },
          })
        }

        return item
      })
    )

    return {
      ok: true,
      data: refreshed,
    }
  })

  app.get("/debts/upcoming", async (request, reply) => {
    const querySchema = z.object({
      days: z.coerce.number().int().min(1).max(30).default(3),
    })

    const { days } = querySchema.parse(request.query)

    if (!("debt" in prisma) || !prisma.debt) {
      return reply.code(500).send({
        ok: false,
        message:
          "Modelo Debt não encontrado no Prisma Client. Rode: npx prisma migrate dev --name debts_module && npx prisma generate e reinicie o backend.",
      })
    }

    const today = startOfToday()
    const endDate = addDays(today, days)

    const debts = await prisma.debt.findMany({
      where: {
        status: {
          not: "paid",
        },
        dueDate: {
          not: null,
          gte: today,
          lte: endDate,
        },
      },
      orderBy: {
        dueDate: "asc",
      },
    })

    const data = debts.map((item) => {
      const dueDate = item.dueDate ? new Date(item.dueDate) : null
      const diffDays = dueDate
        ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null

      return {
        ...item,
        dueDateLabel: dueDate ? normalizeDateOnly(dueDate) : null,
        daysUntilDue: diffDays,
      }
    })

    return {
      ok: true,
      data,
    }
  })

  app.post("/debts", async (request, reply) => {
    const bodySchema = z.object({
      title: z.string().min(1, "Título é obrigatório"),
      creditor: z.string().optional().nullable(),
      totalAmount: z.coerce.number().positive("Valor total deve ser maior que zero"),
      amountPaid: z.coerce.number().min(0).default(0),
      dueDate: z.string().optional().nullable(),
      status: z.enum(["open", "paid", "overdue"]).default("open"),
      notes: z.string().optional().nullable(),
    })

    const body = bodySchema.parse(request.body)

    if (!("debt" in prisma) || !prisma.debt) {
      return reply.code(500).send({
        ok: false,
        message:
          "Modelo Debt não encontrado no Prisma Client. Rode: npx prisma migrate dev --name debts_module && npx prisma generate e reinicie o backend.",
      })
    }

    const created = await prisma.debt.create({
      data: {
        title: body.title.trim(),
        creditor: body.creditor?.trim() || null,
        totalAmount: body.totalAmount,
        amountPaid: body.amountPaid,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: resolveDebtStatus(body.dueDate ? new Date(body.dueDate) : null, body.amountPaid, body.totalAmount),
        notes: body.notes?.trim() || null,
      },
    })

    return reply.code(201).send({
      ok: true,
      message: "Dívida criada com sucesso.",
      data: created,
    })
  })

  app.patch("/debts/:id/payment", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1),
    })

    const bodySchema = z.object({
      amount: z.coerce.number().positive("Valor do pagamento deve ser maior que zero"),
    })

    const { id } = paramsSchema.parse(request.params)
    const { amount } = bodySchema.parse(request.body)

    if (!("debt" in prisma) || !prisma.debt) {
      return reply.code(500).send({
        ok: false,
        message:
          "Modelo Debt não encontrado no Prisma Client. Rode: npx prisma migrate dev --name debts_module && npx prisma generate e reinicie o backend.",
      })
    }

    const debt = await prisma.debt.findUnique({
      where: { id },
    })

    if (!debt) {
      return reply.code(404).send({
        ok: false,
        message: "Dívida não encontrada.",
      })
    }

    const newAmountPaid = Number(debt.amountPaid) + Number(amount)
    const finalAmountPaid =
      newAmountPaid > debt.totalAmount ? debt.totalAmount : newAmountPaid

    const updated = await prisma.debt.update({
      where: { id },
      data: {
        amountPaid: finalAmountPaid,
        status: resolveDebtStatus(debt.dueDate, finalAmountPaid, Number(debt.totalAmount || 0)),
      },
    })

    return {
      ok: true,
      message: "Pagamento registrado com sucesso.",
      data: updated,
    }
  })

  app.delete("/debts/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID da dívida é obrigatório"),
    })

    const { id } = paramsSchema.parse(request.params)

    if (!("debt" in prisma) || !prisma.debt) {
      return reply.code(500).send({
        ok: false,
        message:
          "Modelo Debt não encontrado no Prisma Client. Rode: npx prisma migrate dev --name debts_module && npx prisma generate e reinicie o backend.",
      })
    }

    const existing = await prisma.debt.findUnique({
      where: { id },
    })

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Dívida não encontrada.",
      })
    }

    await prisma.debt.delete({
      where: { id },
    })

    return {
      ok: true,
      message: "Dívida removida com sucesso.",
    }
  })
}
