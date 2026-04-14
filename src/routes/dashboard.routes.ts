import type { FastifyInstance } from "fastify"
import { prisma } from "../db/prisma"

type DashboardAlert = {
  tone: "green" | "yellow" | "red" | "blue"
  message: string
}

type CategoryAliasMap = {
  canonical: string
  aliases: string[]
}

const CATEGORY_ALIAS_MAP: CategoryAliasMap[] = [
  {
    canonical: "alimentacao",
    aliases: [
      "alimentacao",
      "alimentação",
      "mercado",
      "supermercado",
      "ifood",
      "restaurante",
      "lanche",
      "padaria",
      "comida",
    ],
  },
  {
    canonical: "saude",
    aliases: [
      "saude",
      "saúde",
      "farmacia",
      "farmácia",
      "medico",
      "médico",
      "consulta",
      "remedio",
      "remédio",
      "exame",
    ],
  },
  {
    canonical: "transporte",
    aliases: [
      "transporte",
      "uber",
      "99",
      "posto",
      "combustivel",
      "combustível",
      "gasolina",
      "estacionamento",
      "onibus",
      "ônibus",
    ],
  },
  {
    canonical: "moradia",
    aliases: [
      "moradia",
      "aluguel",
      "condominio",
      "condomínio",
      "energia",
      "luz",
      "agua",
      "água",
      "internet",
      "gas",
      "gás",
    ],
  },
  {
    canonical: "lazer",
    aliases: [
      "lazer",
      "cinema",
      "streaming",
      "netflix",
      "spotify",
      "viagem",
      "passeio",
      "diversao",
      "diversão",
    ],
  },
  {
    canonical: "educacao",
    aliases: [
      "educacao",
      "educação",
      "curso",
      "faculdade",
      "livro",
      "treinamento",
      "mensalidade",
    ],
  },
  {
    canonical: "investimentos",
    aliases: [
      "investimento",
      "investimentos",
      "aporte",
      "reserva",
      "poupanca",
      "poupança",
    ],
  },
  {
    canonical: "receitas",
    aliases: [
      "salario",
      "salário",
      "renda",
      "receita",
      "bonus",
      "bônus",
      "comissao",
      "comissão",
    ],
  },
]

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function capitalize(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function prettifyCanonicalCategory(value: string) {
  const labels: Record<string, string> = {
    alimentacao: "Alimentação",
    saude: "Saúde",
    transporte: "Transporte",
    moradia: "Moradia",
    lazer: "Lazer",
    educacao: "Educação",
    investimentos: "Investimentos",
    receitas: "Receitas",
    outros: "Outros",
    sem_categoria: "Sem categoria",
  }

  return labels[value] || capitalize(value.replace(/_/g, " "))
}

function resolveCanonicalCategory(value: string | null | undefined) {
  const normalized = normalizeText(value)

  if (!normalized) {
    return "sem_categoria"
  }

  for (const item of CATEGORY_ALIAS_MAP) {
    if (item.aliases.some((alias) => normalizeText(alias) === normalized)) {
      return item.canonical
    }
  }

  return normalized.replace(/\s+/g, "_")
}

function resolveReferenceDate(record: { occurredAt: Date | null; createdAt: Date }) {
  return record.occurredAt ?? record.createdAt
}

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function paymentMethodLabel(name: string) {
  const labelMap: Record<string, string> = {
    pix: "Pix",
    debito: "Débito",
    credito: "Crédito",
    dinheiro: "Dinheiro",
    sem_forma: "Sem forma",
  }

  return labelMap[name] || capitalize(name.replace(/_/g, " "))
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", async () => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const [messages, goals, debts, budgets] = await Promise.all([
      prisma.financialMessage.findMany({
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.goal.findMany({
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.debt.findMany({
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.budget.findMany({
        orderBy: [
          { year: "desc" },
          { month: "asc" },
          { category: "asc" },
        ],
      }),
    ])

    const validMessages = messages.filter(
      (item) => item.type === "income" || item.type === "expense"
    )

    const enrichedMessages = validMessages.map((item) => ({
      ...item,
      canonicalCategory: resolveCanonicalCategory(item.category),
      referenceDate: resolveReferenceDate(item),
    }))

    const receitas = enrichedMessages
      .filter((item) => item.type === "income")
      .reduce((acc, item) => acc + Number(item.amount || 0), 0)

    const despesas = enrichedMessages
      .filter((item) => item.type === "expense")
      .reduce((acc, item) => acc + Number(item.amount || 0), 0)

    const saldo = receitas - despesas

    const monthMessages = enrichedMessages.filter((item) => {
      return (
        item.referenceDate.getMonth() + 1 === currentMonth &&
        item.referenceDate.getFullYear() === currentYear
      )
    })

    const receitasMes = monthMessages
      .filter((item) => item.type === "income")
      .reduce((acc, item) => acc + Number(item.amount || 0), 0)

    const despesasMes = monthMessages
      .filter((item) => item.type === "expense")
      .reduce((acc, item) => acc + Number(item.amount || 0), 0)

    const saldoMes = receitasMes - despesasMes

    const topExpenseCategories = (() => {
      const map = new Map<string, number>()

      monthMessages
        .filter((item) => item.type === "expense")
        .forEach((item) => {
          const key = item.canonicalCategory || "sem_categoria"
          map.set(key, (map.get(key) || 0) + Number(item.amount || 0))
        })

      return [...map.entries()]
        .map(([name, total]) => ({
          name: prettifyCanonicalCategory(name),
          total,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    })()

    const categoryIntelligence = (() => {
      const map = new Map<
        string,
        {
          canonical: string
          label: string
          total: number
          aliases: Set<string>
          count: number
        }
      >()

      enrichedMessages
        .filter((item) => item.type === "expense")
        .forEach((item) => {
          const canonical = item.canonicalCategory || "sem_categoria"
          const raw = normalizeText(item.category) || "sem categoria"

          if (!map.has(canonical)) {
            map.set(canonical, {
              canonical,
              label: prettifyCanonicalCategory(canonical),
              total: 0,
              aliases: new Set<string>(),
              count: 0,
            })
          }

          const current = map.get(canonical)!
          current.total += Number(item.amount || 0)
          current.count += 1
          current.aliases.add(raw)
        })

      return [...map.values()]
        .map((item) => ({
          canonical: item.canonical,
          label: item.label,
          total: item.total,
          count: item.count,
          aliases: [...item.aliases].sort(),
        }))
        .sort((a, b) => b.total - a.total)
    })()

    const metasAtivas = goals.filter((item) => item.status === "active")
    const metasConcluidas = goals.filter((item) => item.status === "completed")

    const totalObjetivoMetas = goals.reduce(
      (acc, item) => acc + Number(item.target || 0),
      0
    )

    const totalGuardadoMetas = goals.reduce(
      (acc, item) => acc + Number(item.saved || 0),
      0
    )

    const progressoMedioMetas =
      totalObjetivoMetas > 0 ? (totalGuardadoMetas / totalObjetivoMetas) * 100 : 0

    const dividasAbertas = debts.filter((item) => item.status !== "paid")
    const dividasPagas = debts.filter((item) => item.status === "paid")
    const dividasVencidas = debts.filter((item) => item.status === "overdue")

    const totalDividas = debts.reduce(
      (acc, item) => acc + Number(item.totalAmount || 0),
      0
    )

    const totalPagoDividas = debts.reduce(
      (acc, item) => acc + Number(item.amountPaid || 0),
      0
    )

    const totalEmAbertoDividas = totalDividas - totalPagoDividas

    const expenseMessages = enrichedMessages.filter((item) => item.type === "expense")

    const intelligentBudgets = budgets.map((budget) => {
      const budgetCanonicalCategory = resolveCanonicalCategory(budget.category)

      const actualCalculated = expenseMessages.reduce((acc, item) => {
        const sameMonth = item.referenceDate.getMonth() + 1 === budget.month
        const sameYear = item.referenceDate.getFullYear() === budget.year
        const sameCategory = item.canonicalCategory === budgetCanonicalCategory

        if (!sameMonth || !sameYear || !sameCategory) {
          return acc
        }

        return acc + Number(item.amount || 0)
      }, 0)

      const planned = Number(budget.planned || 0)
      const actual = Number(actualCalculated || 0)
      const difference = planned - actual
      const percentUsed = planned > 0 ? (actual / planned) * 100 : 0

      let status: "ok" | "warning" | "exceeded" = "ok"

      if (actual > planned) {
        status = "exceeded"
      } else if (actual >= planned * 0.8) {
        status = "warning"
      }

      return {
        id: budget.id,
        category: budget.category,
        normalizedCategory: prettifyCanonicalCategory(budgetCanonicalCategory),
        month: budget.month,
        year: budget.year,
        planned,
        actual,
        difference,
        percentUsed,
        status,
      }
    })

    const currentBudgets = intelligentBudgets.filter(
      (item) => item.month === currentMonth && item.year === currentYear
    )

    const orcamentosEstourados = currentBudgets.filter(
      (item) => item.status === "exceeded"
    )

    const orcamentosNoLimite = currentBudgets.filter(
      (item) => item.status === "warning"
    )

    const totalPlanejadoMes = currentBudgets.reduce(
      (acc, item) => acc + Number(item.planned || 0),
      0
    )

    const totalRealizadoMes = currentBudgets.reduce(
      (acc, item) => acc + Number(item.actual || 0),
      0
    )

    const budgetCoveragePercent =
      totalPlanejadoMes > 0 ? (totalRealizadoMes / totalPlanejadoMes) * 100 : 0

    const biggestExpense = topExpenseCategories[0] || null

    const alerts: DashboardAlert[] = []

    if (orcamentosEstourados.length > 0) {
      alerts.push({
        tone: "red",
        message: `${orcamentosEstourados.length} orçamento(s) estourado(s) no mês atual.`,
      })
    }

    if (orcamentosNoLimite.length > 0) {
      alerts.push({
        tone: "yellow",
        message: `${orcamentosNoLimite.length} orçamento(s) próximos do limite no mês atual.`,
      })
    }

    if (dividasVencidas.length > 0) {
      alerts.push({
        tone: "red",
        message: `${dividasVencidas.length} dívida(s) vencida(s) exigem atenção.`,
      })
    }

    if (metasAtivas.length > 0) {
      alerts.push({
        tone: "blue",
        message: `${metasAtivas.length} meta(s) ativa(s) em acompanhamento.`,
      })
    }

    if (alerts.length === 0) {
      alerts.push({
        tone: "green",
        message: "Tudo sob controle no momento. Nenhum alerta crítico encontrado.",
      })
    }

    const executiveSummary = [
      `Você registrou ${validMessages.length} lançamento(s) financeiro(s).`,
      `Saldo geral atual: ${money(saldo)}.`,
      `No mês atual, suas despesas somam ${money(despesasMes)}.`,
      biggestExpense
        ? `Maior categoria de despesa do mês: ${biggestExpense.name} (${money(
            biggestExpense.total
          )}).`
        : "Ainda não há categoria de despesa dominante no mês atual.",
      `${metasAtivas.length} meta(s) ativa(s), ${dividasAbertas.length} dívida(s) em aberto e ${orcamentosEstourados.length} orçamento(s) estourado(s).`,
    ]

    const monthlySeries = (() => {
      const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

      const result = Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: labels[index],
        receitas: 0,
        despesas: 0,
        saldo: 0,
      }))

      enrichedMessages.forEach((item) => {
        const refDate = item.referenceDate
        if (refDate.getFullYear() !== currentYear) return

        const monthIndex = refDate.getMonth()
        if (item.type === "income") {
          result[monthIndex].receitas += Number(item.amount || 0)
        } else if (item.type === "expense") {
          result[monthIndex].despesas += Number(item.amount || 0)
        }
      })

      return result.map((item) => ({
        ...item,
        saldo: item.receitas - item.despesas,
      }))
    })()

    const paymentMethodDistribution = (() => {
      const map = new Map<string, number>()

      monthMessages.forEach((item) => {
        const key = normalizeText(item.paymentMethod).replace(/\s+/g, "_") || "sem_forma"
        map.set(key, (map.get(key) || 0) + Number(item.amount || 0))
      })

      return [...map.entries()]
        .map(([name, total]) => ({
          name: paymentMethodLabel(name),
          total,
        }))
        .sort((a, b) => b.total - a.total)
    })()

    const budgetStatusDistribution = [
      {
        name: "Dentro do limite",
        total: currentBudgets.filter((item) => item.status === "ok").length,
      },
      {
        name: "No limite",
        total: currentBudgets.filter((item) => item.status === "warning").length,
      },
      {
        name: "Estourado",
        total: currentBudgets.filter((item) => item.status === "exceeded").length,
      },
    ]

    return {
      ok: true,
      data: {
        saldo,
        receitas,
        despesas,
        totalRegistros: validMessages.length,

        monthRef: {
          month: currentMonth,
          year: currentYear,
        },

        monthly: {
          saldo: saldoMes,
          receitas: receitasMes,
          despesas: despesasMes,
        },

        goals: {
          total: goals.length,
          active: metasAtivas.length,
          completed: metasConcluidas.length,
          totalTarget: totalObjetivoMetas,
          totalSaved: totalGuardadoMetas,
          averageProgressPercent: progressoMedioMetas > 100 ? 100 : progressoMedioMetas,
        },

        debts: {
          total: debts.length,
          open: dividasAbertas.length,
          paid: dividasPagas.length,
          overdue: dividasVencidas.length,
          totalAmount: totalDividas,
          totalPaid: totalPagoDividas,
          totalOpenAmount: totalEmAbertoDividas,
        },

        budgets: {
          total: currentBudgets.length,
          exceeded: orcamentosEstourados.length,
          warning: orcamentosNoLimite.length,
          totalPlanned: totalPlanejadoMes,
          totalActual: totalRealizadoMes,
          percentUsed: budgetCoveragePercent > 999 ? 999 : budgetCoveragePercent,
        },

        topExpenseCategories,
        categoryIntelligence,
        monthlySeries,
        paymentMethodDistribution,
        budgetStatusDistribution,
        alerts,
        executiveSummary,
      },
    }
  })
}