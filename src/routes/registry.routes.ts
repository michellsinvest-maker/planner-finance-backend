import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/prisma"

type BudgetIntelligenceItem = {
  id: string
  category: string
  month: number
  year: number
  planned: number
  actual: number
  difference: number
  percentUsed: number
  status: "ok" | "warning" | "exceeded"
  createdAt: Date
  updatedAt: Date
}

function resolveReferenceDate(record: { occurredAt: Date | null; createdAt: Date }) {
  return record.occurredAt ?? record.createdAt
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase()
}

export async function registryRoutes(app: FastifyInstance) {
  app.get("/categories", async () => {
    const categories = await prisma.category.findMany({
      orderBy: { createdAt: "desc" },
    })

    return {
      ok: true,
      data: categories,
    }
  })

  app.post("/categories", async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      type: z.enum(["income", "expense"]),
    })

    const { name, type } = bodySchema.parse(request.body)

    const exists = await prisma.category.findFirst({
      where: {
        name: name.trim(),
        type,
      },
    })

    if (exists) {
      return reply.code(400).send({
        ok: false,
        message: "Categoria já cadastrada para este tipo.",
      })
    }

    const created = await prisma.category.create({
      data: {
        name: name.trim(),
        type,
      },
    })

    return reply.code(201).send({
      ok: true,
      message: "Categoria criada com sucesso.",
      data: created,
    })
  })

  app.delete("/categories/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID da categoria é obrigatório"),
    })

    const { id } = paramsSchema.parse(request.params)

    const existing = await prisma.category.findUnique({
      where: { id },
    })

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Categoria não encontrada.",
      })
    }

    await prisma.category.delete({
      where: { id },
    })

    return {
      ok: true,
      message: "Categoria removida com sucesso.",
    }
  })

  app.get("/accounts", async () => {
    const accounts = await prisma.account.findMany({
      orderBy: { createdAt: "desc" },
    })

    return {
      ok: true,
      data: accounts,
    }
  })

  app.post("/accounts", async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      balance: z.coerce.number().min(0, "Saldo não pode ser negativo"),
    })

    const { name, balance } = bodySchema.parse(request.body)

    const exists = await prisma.account.findFirst({
      where: {
        name: name.trim(),
      },
    })

    if (exists) {
      return reply.code(400).send({
        ok: false,
        message: "Conta já cadastrada.",
      })
    }

    const created = await prisma.account.create({
      data: {
        name: name.trim(),
        balance,
      },
    })

    return reply.code(201).send({
      ok: true,
      message: "Conta criada com sucesso.",
      data: created,
    })
  })

  app.delete("/accounts/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID da conta é obrigatório"),
    })

    const { id } = paramsSchema.parse(request.params)

    const existing = await prisma.account.findUnique({
      where: { id },
    })

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Conta não encontrada.",
      })
    }

    await prisma.account.delete({
      where: { id },
    })

    return {
      ok: true,
      message: "Conta removida com sucesso.",
    }
  })

  app.get("/cards", async () => {
    const cards = await prisma.card.findMany({
      orderBy: { createdAt: "desc" },
    })

    return {
      ok: true,
      data: cards,
    }
  })

  app.post("/cards", async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      limit: z.coerce.number().min(0, "Limite não pode ser negativo"),
      closingDay: z.coerce.number().int().min(1).max(31),
    })

    const { name, limit, closingDay } = bodySchema.parse(request.body)

    const exists = await prisma.card.findFirst({
      where: {
        name: name.trim(),
      },
    })

    if (exists) {
      return reply.code(400).send({
        ok: false,
        message: "Cartão já cadastrado.",
      })
    }

    const created = await prisma.card.create({
      data: {
        name: name.trim(),
        limit,
        closingDay,
      },
    })

    return reply.code(201).send({
      ok: true,
      message: "Cartão criado com sucesso.",
      data: created,
    })
  })

  app.delete("/cards/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID do cartão é obrigatório"),
    })

    const { id } = paramsSchema.parse(request.params)

    const existing = await prisma.card.findUnique({
      where: { id },
    })

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Cartão não encontrado.",
      })
    }

    await prisma.card.delete({
      where: { id },
    })

    return {
      ok: true,
      message: "Cartão removido com sucesso.",
    }
  })

  app.get("/goals", async () => {
    const goals = await prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
    })

    return {
      ok: true,
      data: goals,
    }
  })

  app.post("/goals", async (request, reply) => {
    const bodySchema = z.object({
      title: z.string().min(1, "Nome da meta é obrigatório"),
      target: z.coerce.number().positive("Valor objetivo deve ser maior que zero"),
      saved: z.coerce.number().min(0).default(0),
      deadline: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })

    const body = bodySchema.parse(request.body)

    const created = await prisma.goal.create({
      data: {
        title: body.title.trim(),
        target: body.target,
        saved: body.saved,
        deadline: body.deadline ? new Date(body.deadline) : null,
        notes: body.notes?.trim() || null,
        status: body.saved >= body.target ? "completed" : "active",
      },
    })

    return reply.code(201).send({
      ok: true,
      message: "Meta criada com sucesso.",
      data: created,
    })
  })

  app.patch("/goals/:id/progress", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1),
    })

    const bodySchema = z.object({
      amount: z.coerce.number().positive("Valor do aporte deve ser maior que zero"),
    })

    const { id } = paramsSchema.parse(request.params)
    const { amount } = bodySchema.parse(request.body)

    const goal = await prisma.goal.findUnique({
      where: { id },
    })

    if (!goal) {
      return reply.code(404).send({
        ok: false,
        message: "Meta não encontrada.",
      })
    }

    const newSaved = Number(goal.saved) + Number(amount)
    const finalSaved = newSaved > goal.target ? goal.target : newSaved

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        saved: finalSaved,
        status: finalSaved >= goal.target ? "completed" : "active",
      },
    })

    return {
      ok: true,
      message: "Progresso da meta atualizado com sucesso.",
      data: updated,
    }
  })

  app.patch("/goals/:id/complete", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1),
    })

    const { id } = paramsSchema.parse(request.params)

    const goal = await prisma.goal.findUnique({
      where: { id },
    })

    if (!goal) {
      return reply.code(404).send({
        ok: false,
        message: "Meta não encontrada.",
      })
    }

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        saved: goal.target,
        status: "completed",
      },
    })

    return {
      ok: true,
      message: "Meta concluída com sucesso.",
      data: updated,
    }
  })

  app.delete("/goals/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID da meta é obrigatório"),
    })

    const { id } = paramsSchema.parse(request.params)

    const existing = await prisma.goal.findUnique({
      where: { id },
    })

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Meta não encontrada.",
      })
    }

    await prisma.goal.delete({
      where: { id },
    })

    return {
      ok: true,
      message: "Meta removida com sucesso.",
    }
  })

  app.get("/budgets", async (request) => {
    const querySchema = z.object({
      year: z.coerce.number().int().optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
    })

    const { year, month } = querySchema.parse(request.query)

    const budgets = await prisma.budget.findMany({
      where: {
        ...(typeof year === "number" ? { year } : {}),
        ...(typeof month === "number" ? { month } : {}),
      },
      orderBy: [{ year: "desc" }, { month: "asc" }, { category: "asc" }],
    })

    const expenseMessages = await prisma.financialMessage.findMany({
      where: {
        type: "expense",
      },
      select: {
        amount: true,
        category: true,
        occurredAt: true,
        createdAt: true,
      },
    })

    const data: BudgetIntelligenceItem[] = budgets.map((budget) => {
      const actualCalculated = expenseMessages.reduce((acc, item) => {
        const refDate = resolveReferenceDate(item)
        const sameMonth = refDate.getMonth() + 1 === budget.month
        const sameYear = refDate.getFullYear() === budget.year
        const sameCategory =
          normalizeText(item.category) === normalizeText(budget.category)

        if (!sameMonth || !sameYear || !sameCategory) {
          return acc
        }

        return acc + Number(item.amount || 0)
      }, 0)

      const planned = Number(budget.planned || 0)
      const actual = Number(actualCalculated || 0)
      const difference = planned - actual
      const percentRaw = planned > 0 ? (actual / planned) * 100 : 0
      const percentUsed = percentRaw > 999 ? 999 : percentRaw

      let status: "ok" | "warning" | "exceeded" = "ok"

      if (actual > planned) {
        status = "exceeded"
      } else if (actual >= planned * 0.8) {
        status = "warning"
      }

      return {
        id: budget.id,
        category: budget.category,
        month: budget.month,
        year: budget.year,
        planned,
        actual,
        difference,
        percentUsed,
        status,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
      }
    })

    return {
      ok: true,
      data,
    }
  })

  app.post("/budgets", async (request, reply) => {
    const bodySchema = z.object({
      category: z.string().min(1, "Categoria é obrigatória"),
      month: z.coerce.number().int().min(1).max(12),
      year: z.coerce.number().int().min(2000).max(2100),
      planned: z.coerce.number().positive("Valor planejado deve ser maior que zero"),
    })

    const body = bodySchema.parse(request.body)

    const exists = await prisma.budget.findFirst({
      where: {
        category: body.category.trim(),
        month: body.month,
        year: body.year,
      },
    })

    if (exists) {
      return reply.code(400).send({
        ok: false,
        message: "Orçamento já existe para essa categoria neste mês/ano.",
      })
    }

    const created = await prisma.budget.create({
      data: {
        category: body.category.trim(),
        month: body.month,
        year: body.year,
        planned: body.planned,
        actual: 0,
      },
    })

    return reply.code(201).send({
      ok: true,
      message: "Orçamento criado com sucesso.",
      data: created,
    })
  })

  app.delete("/budgets/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID do orçamento é obrigatório"),
    })

    const { id } = paramsSchema.parse(request.params)

    const existing = await prisma.budget.findUnique({
      where: { id },
    })

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Orçamento não encontrado.",
      })
    }

    await prisma.budget.delete({
      where: { id },
    })

    return {
      ok: true,
      message: "Orçamento removido com sucesso.",
    }
  })
}