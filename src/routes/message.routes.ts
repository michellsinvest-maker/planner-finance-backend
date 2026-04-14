import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { parseFinancialMessage } from "../services/parser.service";
import { whatsappService } from "../services/whatsapp.service";

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, value: string) {
  const normalizedText = normalizeText(text);
  const normalizedValue = normalizeText(value);
  return new RegExp(`\\b${escapeRegex(normalizedValue)}\\b`).test(normalizedText);
}

function buildEntityAliases(name: string, kind: "account" | "card") {
  const normalized = normalizeText(name);
  const aliases = new Set<string>();

  if (!normalized) return [];

  aliases.add(normalized);
  aliases.add(normalized.replace(/\s+/g, ""));
  aliases.add(normalized.replace(/\bpj\b/g, "").trim());
  aliases.add(normalized.replace(/\bpf\b/g, "").trim());

  if (normalized.includes("inter")) {
    aliases.add("inter");
    aliases.add("banco inter");
    aliases.add("inter pj");
    aliases.add("interpj");
    aliases.add("interior");
  }

  if (normalized.includes("nubank")) {
    aliases.add("nubank");
    aliases.add("nu bank");
    aliases.add("nu");
    aliases.add("lubenque");
    aliases.add("nubenk");
    aliases.add("nubamk");
    aliases.add("lubank");

    if (kind === "card") {
      aliases.add("bank");
      aliases.add("no bank");
    }
  }

  if (normalized.includes("mercado pago")) {
    aliases.add("mercado pago");
    aliases.add("mercadopago");
    aliases.add("mp");
  }

  if (normalized.includes("picpay")) {
    aliases.add("picpay");
    aliases.add("pic pay");
  }

  return [...aliases]
    .map((item) => item.trim())
    .filter(Boolean);
}

function textMatchesAnyAlias(text: string, aliases: string[]) {
  const normalizedText = normalizeText(text);

  return aliases.some((alias) => {
    if (!alias) return false;

    if (alias.includes(" ")) {
      return normalizedText.includes(alias);
    }

    return hasWord(normalizedText, alias);
  });
}

function isDebtLikeText(text: string): boolean {
  const normalizedText = normalizeText(text);

  const hasDebtSubject =
    normalizedText.includes("tenho uma conta") ||
    normalizedText.includes("tenham uma conta") ||
    normalizedText.includes("conta a vencer") ||
    normalizedText.includes("conta que vence") ||
    normalizedText.includes("conta vence") ||
    normalizedText.includes("boleto que vence") ||
    normalizedText.includes("boleto vence") ||
    normalizedText.includes("fatura que vence") ||
    normalizedText.includes("fatura vence") ||
    normalizedText.includes("mensalidade que vence") ||
    normalizedText.includes("mensalidade vence");

  const hasDueSignal =
    normalizedText.includes("vence dia") ||
    normalizedText.includes("vencimento dia") ||
    normalizedText.includes("vem esse dia") ||
    normalizedText.includes("vem dia") ||
    normalizedText.includes("que vem esse dia") ||
    normalizedText.includes("que vence") ||
    /\bdia\s+\d{1,2}\b/.test(normalizedText);

  return hasDebtSubject && hasDueSignal;
}

function inferPreferredPaymentMethod(
  text: string,
  parsed: ReturnType<typeof parseFinancialMessage>
) {
  const normalizedText = normalizeText(text);

  if (parsed.paymentMethod) return parsed.paymentMethod;
  if ((parsed.totalInstallments || 0) > 1) return "credito";

  if (
    hasWord(normalizedText, "passei") ||
    hasWord(normalizedText, "cartao") ||
    hasWord(normalizedText, "fatura") ||
    hasWord(normalizedText, "credito") ||
    hasWord(normalizedText, "parcelado")
  ) {
    return "credito";
  }

  if (hasWord(normalizedText, "pix")) return "pix";
  if (hasWord(normalizedText, "debito")) return "debito";
  if (hasWord(normalizedText, "dinheiro")) return "dinheiro";
  if (hasWord(normalizedText, "boleto")) return "boleto";
  if (hasWord(normalizedText, "transferencia")) return "transferencia";

  if (hasWord(normalizedText, "banco") || hasWord(normalizedText, "conta")) {
    return parsed.type === "income" ? "transferencia" : "debito";
  }

  if (parsed.type === "expense") {
    return "debito";
  }

  if (parsed.type === "income") {
    return "transferencia";
  }

  return null;
}

type ResolvedSource =
  | {
      kind: "account";
      id: string;
      name: string;
      paymentMethod: string | null;
    }
  | {
      kind: "card";
      id: string;
      name: string;
      paymentMethod: string | null;
    }
  | {
      kind: "none";
      paymentMethod: string | null;
    };

async function resolveFinancialSource(
  originalText: string,
  parsed: ReturnType<typeof parseFinancialMessage>
): Promise<ResolvedSource> {
  const normalizedText = normalizeText(originalText);
  const preferredPaymentMethod = inferPreferredPaymentMethod(originalText, parsed);

  const [accounts, cards] = await Promise.all([
    prisma.account.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.card.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const matchedAccount =
    accounts.find((item) =>
      textMatchesAnyAlias(normalizedText, buildEntityAliases(item.name, "account"))
    ) || null;

  const matchedCard =
    cards.find((item) =>
      textMatchesAnyAlias(normalizedText, buildEntityAliases(item.name, "card"))
    ) || null;

  const isCreditContext =
    preferredPaymentMethod === "credito" ||
    (parsed.totalInstallments || 0) > 1 ||
    hasWord(normalizedText, "passei") ||
    hasWord(normalizedText, "parcelado") ||
    hasWord(normalizedText, "fatura") ||
    hasWord(normalizedText, "cartao");

  const isAccountContext =
    preferredPaymentMethod === "pix" ||
    preferredPaymentMethod === "debito" ||
    preferredPaymentMethod === "dinheiro" ||
    preferredPaymentMethod === "boleto" ||
    preferredPaymentMethod === "transferencia" ||
    hasWord(normalizedText, "banco") ||
    hasWord(normalizedText, "conta") ||
    hasWord(normalizedText, "pix");

  if (parsed.type === "income") {
    if (matchedAccount) {
      return {
        kind: "account",
        id: matchedAccount.id,
        name: matchedAccount.name,
        paymentMethod: preferredPaymentMethod || "transferencia",
      };
    }

    return {
      kind: "none",
      paymentMethod: preferredPaymentMethod,
    };
  }

  if (parsed.type === "expense") {
    if (isCreditContext && matchedCard) {
      return {
        kind: "card",
        id: matchedCard.id,
        name: matchedCard.name,
        paymentMethod: "credito",
      };
    }

    if (isAccountContext && matchedAccount) {
      return {
        kind: "account",
        id: matchedAccount.id,
        name: matchedAccount.name,
        paymentMethod:
          preferredPaymentMethod ||
          (hasWord(normalizedText, "pix") ? "pix" : "debito"),
      };
    }

    if (matchedCard && !matchedAccount) {
      return {
        kind: "card",
        id: matchedCard.id,
        name: matchedCard.name,
        paymentMethod: preferredPaymentMethod || "credito",
      };
    }

    if (matchedAccount && !matchedCard) {
      return {
        kind: "account",
        id: matchedAccount.id,
        name: matchedAccount.name,
        paymentMethod: preferredPaymentMethod || "debito",
      };
    }
  }

  return {
    kind: "none",
    paymentMethod: preferredPaymentMethod,
  };
}

export async function messageRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      ok: true,
      service: "planner-finance-backend",
    };
  });

  app.get("/whatsapp/status", async () => {
    return whatsappService.getStatus();
  });

  app.post("/messages/parse", async (request, reply) => {
    const bodySchema = z.object({
      text: z.string().min(1, "Texto é obrigatório"),
    });

    const { text } = bodySchema.parse(request.body);

    if (isDebtLikeText(text)) {
      return reply.code(409).send({
        ok: false,
        message: "Mensagem identificada como conta a vencer. Use o fluxo de dívidas.",
        code: "DEBT_INTENT_DETECTED",
      });
    }

    const parsed = parseFinancialMessage(text);

    return reply.send({
      ok: true,
      parsed,
    });
  });

  app.post("/messages", async (request, reply) => {
    const bodySchema = z.object({
      text: z.string().min(1, "Texto é obrigatório"),
    });

    const { text } = bodySchema.parse(request.body);
    const parsed = parseFinancialMessage(text);

    if (parsed.type === "unknown" || !parsed.amount || parsed.amount <= 0) {
      return reply.code(400).send({
        ok: false,
        error: "INVALID_FINANCIAL_MESSAGE",
        message: "Mensagem ignorada: não é um lançamento financeiro válido",
      });
    }

    const source = await resolveFinancialSource(text, parsed);

    const finalPaymentMethod =
      source.paymentMethod ||
      parsed.paymentMethod ||
      inferPreferredPaymentMethod(text, parsed) ||
      null;

    const finalSourceType = source.kind === "none" ? null : source.kind;
    const finalSourceName = source.kind === "none" ? null : source.name;

    const saved = await prisma.$transaction(async (tx) => {
      if (source.kind === "account") {
        const account = await tx.account.findUnique({
          where: { id: source.id },
        });

        if (!account) {
          throw new Error("Conta vinculada não encontrada.");
        }

        const currentBalance = Number(account.balance || 0);
        const amount = Number(parsed.amount || 0);

        const nextBalance =
          parsed.type === "income"
            ? currentBalance + amount
            : currentBalance - amount;

        await tx.account.update({
          where: { id: source.id },
          data: {
            balance: nextBalance,
          },
        });
      }

      if (source.kind === "card") {
        const card = await tx.card.findUnique({
          where: { id: source.id },
        });

        if (!card) {
          throw new Error("Cartão vinculado não encontrado.");
        }

        const currentLimit = Number(card.limit || 0);
        const amount = Number(parsed.amount || 0);

        const nextLimit = currentLimit - amount;

        await tx.card.update({
          where: { id: source.id },
          data: {
            limit: nextLimit,
          },
        });
      }

      return tx.financialMessage.create({
        data: {
          originalText: parsed.originalText,
          normalizedText: parsed.normalizedText,
          amount: parsed.amount,
          type: parsed.type,
          category: parsed.category,
          description: parsed.description,
          paymentMethod: finalPaymentMethod,
          sourceType: finalSourceType,
          sourceName: finalSourceName,
          installment: parsed.installment,
          totalInstallments: parsed.totalInstallments,
          occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
        },
      });
    });

    return reply.code(201).send({
      ok: true,
      message: "Mensagem financeira salva com sucesso",
      data: {
        id: saved.id,
        originalText: saved.originalText,
        normalizedText: saved.normalizedText,
        amount: Number(saved.amount),
        type: saved.type,
        category: saved.category,
        description: saved.description,
        paymentMethod: saved.paymentMethod,
        sourceType: saved.sourceType,
        sourceName: saved.sourceName,
        installment: saved.installment,
        totalInstallments: saved.totalInstallments,
        createdAt: saved.createdAt,
        occurredAt: saved.occurredAt,
      },
      financialImpact: {
        sourceType: finalSourceType,
        sourceName: finalSourceName,
        paymentMethod: finalPaymentMethod,
        installments:
          saved.totalInstallments && saved.totalInstallments > 1
            ? {
                current: saved.installment || 1,
                total: saved.totalInstallments,
              }
            : null,
      },
    });
  });

  app.get("/messages", async () => {
    const messages = await prisma.financialMessage.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      ok: true,
      data: messages.map((item) => ({
        ...item,
        sourceType: item.sourceType || null,
        sourceName: item.sourceName || null,
      })),
    };
  });

  app.delete("/messages/:id", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().min(1, "ID da transação é obrigatório"),
    });

    const { id } = paramsSchema.parse(request.params);

    const existing = await prisma.financialMessage.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        message: "Transação não encontrada",
      });
    }

    await prisma.financialMessage.delete({
      where: { id },
    });

    return reply.send({
      ok: true,
      message: "Transação removida com sucesso",
    });
  });
}