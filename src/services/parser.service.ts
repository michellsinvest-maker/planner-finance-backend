export type ParsedMessageType = "expense" | "income" | "unknown";

export interface ParsedMessageResult {
  originalText: string;
  normalizedText: string;
  amount: number | null;
  type: ParsedMessageType;
  category: string | null;
  description: string | null;
  paymentMethod: string | null;
  installment: number | null;
  totalInstallments: number | null;
  occurredAt: string | null;
}

type CategoryRule = {
  category: string;
  keywords: string[];
};

type InstitutionRule = {
  canonical: string;
  keywords: string[];
  incomeHints?: string[];
  expenseHints?: string[];
};

type MerchantRule = {
  label: string;
  keywords: string[];
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "alimentacao",
    keywords: [
      "mercado",
      "supermercado",
      "padaria",
      "restaurante",
      "lanche",
      "almoco",
      "almoco executivo",
      "janta",
      "jantar",
      "cafe",
      "cafeteria",
      "ifood",
      "comida",
      "acougue",
      "feira",
      "hortifruti",
      "pizza",
      "hamburguer",
      "sushi",
    ],
  },
  {
    category: "transporte",
    keywords: [
      "uber",
      "99",
      "taxi",
      "gasolina",
      "combustivel",
      "etanol",
      "posto",
      "estacionamento",
      "pedagio",
      "onibus",
      "metro",
      "transporte",
      "passagem",
      "corrida",
    ],
  },
  {
    category: "saude",
    keywords: [
      "farmacia",
      "remedio",
      "consulta",
      "medico",
      "dentista",
      "clinica",
      "hospital",
      "exame",
      "saude",
      "plano de saude",
      "psicologo",
      "terapia",
      "academia",
    ],
  },
  {
    category: "moradia",
    keywords: [
      "aluguel",
      "condominio",
      "agua",
      "luz",
      "energia",
      "internet",
      "moradia",
      "iptu",
      "gas",
      "reforma",
      "manutencao",
      "moveis",
    ],
  },
  {
    category: "lazer",
    keywords: [
      "cinema",
      "netflix",
      "spotify",
      "show",
      "festa",
      "bar",
      "viagem",
      "passeio",
      "lazer",
      "game",
      "jogo",
      "streaming",
    ],
  },
  {
    category: "educacao",
    keywords: [
      "curso",
      "faculdade",
      "escola",
      "livro",
      "treinamento",
      "educacao",
      "material escolar",
      "mensalidade",
    ],
  },
  {
    category: "trabalho",
    keywords: [
      "software",
      "ferramenta",
      "dominio",
      "hospedagem",
      "servico",
      "freela",
      "freelancer",
      "trabalho",
      "site",
      "app",
      "assinatura",
    ],
  },
  {
    category: "vestuario",
    keywords: [
      "roupa",
      "camisa",
      "calca",
      "sapato",
      "tenis",
      "vestuario",
      "loja de roupa",
      "blusa",
      "short",
    ],
  },
  {
    category: "emprestimo",
    keywords: ["emprestimo", "emprestimo do", "emprestimo de"],
  },
  {
    category: "receita",
    keywords: [
      "recebi",
      "ganhei",
      "entrada",
      "entrou",
      "caiu",
      "salario",
      "pagamento recebido",
      "pix recebido",
      "deposito recebido",
      "bonus",
      "comissao",
      "vendi",
      "faturei",
      "recebimento",
      "reembolso recebido",
      "cliente pagou",
    ],
  },
];

const MERCHANT_RULES: MerchantRule[] = [
  { label: "supermercado", keywords: ["supermercado"] },
  { label: "mercado", keywords: ["mercado"] },
  { label: "padaria", keywords: ["padaria"] },
  { label: "farmacia", keywords: ["farmacia"] },
  { label: "posto", keywords: ["posto", "gasolina", "combustivel", "etanol"] },
  { label: "uber", keywords: ["uber"] },
  { label: "99", keywords: ["99", "app 99", "corrida 99"] },
  { label: "restaurante", keywords: ["restaurante"] },
  { label: "ifood", keywords: ["ifood"] },
  { label: "academia", keywords: ["academia"] },
  { label: "aluguel", keywords: ["aluguel"] },
  { label: "internet", keywords: ["internet"] },
  { label: "agua", keywords: ["agua"] },
  { label: "luz", keywords: ["luz", "energia"] },
  { label: "condominio", keywords: ["condominio"] },
  { label: "salario", keywords: ["salario"] },
  { label: "tv", keywords: ["tv", "televisao", "televisão"] },
];

const INCOME_KEYWORDS = [
  "recebi",
  "ganhei",
  "entrada",
  "entrou",
  "caiu",
  "salario",
  "pagamento recebido",
  "pix recebido",
  "deposito recebido",
  "bonus",
  "comissao",
  "vendi",
  "faturei",
  "recebimento",
  "reembolso recebido",
  "cliente pagou",
  "recebido",
];

const EXPENSE_KEYWORDS = [
  "gastei",
  "gaftei",
  "paguei",
  "comprei",
  "saiu",
  "debito",
  "boleto",
  "conta",
  "parcela",
  "parcelado",
  "pix enviado",
  "transferi",
  "passei",
  "cartao",
  "usei no cartao",
  "despesa",
  "aluguel",
  "mercado",
  "farmacia",
  "uber",
  "gasolina",
  "restaurante",
  "padaria",
  "ifood",
  "internet",
  "agua",
  "luz",
  "pagamento",
  "fatura",
];

const PAYMENT_METHOD_RULES = [
  { value: "pix", keywords: ["pix", "via pix"] },
  { value: "debito", keywords: ["debito", "no debito", "cartao de debito"] },
  {
    value: "credito",
    keywords: [
      "credito",
      "no credito",
      "cartao de credito",
      "parcelado",
      "parcela",
      "fatura",
      "passei",
      "cartao",
    ],
  },
  { value: "dinheiro", keywords: ["dinheiro", "em especie"] },
];

const INSTITUTION_RULES: InstitutionRule[] = [
  {
    canonical: "nubank",
    keywords: [
      "nubank",
      "nu bank",
      "nu",
      "bank",
      "no bank",
      "lubenque",
      "nubenk",
      "nubamk",
      "lubank",
    ],
    expenseHints: ["cartao", "credito", "debito", "fatura", "parcela", "passei"],
  },
  {
    canonical: "inter",
    keywords: ["inter", "banco inter", "inter pj", "interpj"],
    incomeHints: ["caiu", "entrou", "recebi"],
    expenseHints: ["cartao", "credito", "debito", "pix", "passei", "banco", "conta"],
  },
  {
    canonical: "mercado pago",
    keywords: ["mercado pago", "mercadopago", "mpago", "mp"],
    expenseHints: ["cartao", "credito", "debito", "maquininha", "pix", "conta"],
  },
  {
    canonical: "picpay",
    keywords: ["picpay", "pic pay"],
    expenseHints: ["pix", "cartao"],
  },
  {
    canonical: "caixa",
    keywords: ["caixa", "cef"],
    incomeHints: ["caiu", "entrou", "recebi"],
    expenseHints: ["pix", "transferi"],
  },
  {
    canonical: "itau",
    keywords: ["itau", "itaú", "tau"],
    incomeHints: ["caiu", "entrou", "recebi"],
    expenseHints: ["pix", "cartao", "debito", "conta"],
  },
  {
    canonical: "bradesco",
    keywords: ["bradesco"],
    incomeHints: ["caiu", "entrou", "recebi"],
    expenseHints: ["pix", "cartao"],
  },
  {
    canonical: "santander",
    keywords: ["santander"],
    incomeHints: ["caiu", "entrou", "recebi"],
    expenseHints: ["pix", "cartao"],
  },
  {
    canonical: "banco do brasil",
    keywords: ["banco do brasil", "bb"],
    incomeHints: ["caiu", "entrou", "recebi"],
    expenseHints: ["pix", "cartao"],
  },
  {
    canonical: "neon",
    keywords: ["neon"],
    expenseHints: ["cartao", "pix"],
  },
  {
    canonical: "wise",
    keywords: ["wise"],
    expenseHints: ["cartao", "pix"],
  },
  {
    canonical: "paypal",
    keywords: ["paypal", "pay pal"],
    expenseHints: ["assinatura", "pagamento"],
    incomeHints: ["recebi", "entrou"],
  },
];

const GENERIC_STOPWORDS = [
  "via",
  "no",
  "na",
  "de",
  "do",
  "da",
  "em",
  "pro",
  "pra",
  "para",
  "com",
  "por",
  "foi",
  "na conta",
  "conta",
  "reais",
  "real",
  "um",
  "uma",
  "o",
  "a",
  "e",
];

const INSTALLMENT_ONLY_PATTERNS = [
  /\b\d{1,2}x\b/,
  /\bem\s+\d{1,2}\s+vezes\b/,
  /\b\d{1,2}\s+vezes\b/,
  /\bem\s+\d{1,2}x\b/,
  /\bem duas vezes\b/,
  /\bduas vezes\b/,
  /\bem tres vezes\b/,
  /\btres vezes\b/,
  /\bem quatro vezes\b/,
  /\bquatro vezes\b/,
  /\bem cinco vezes\b/,
  /\bcinco vezes\b/,
  /\bem seis vezes\b/,
  /\bseis vezes\b/,
  /\bem sete vezes\b/,
  /\bsete vezes\b/,
  /\bem oito vezes\b/,
  /\boito vezes\b/,
  /\bem nove vezes\b/,
  /\bnove vezes\b/,
  /\bem dez vezes\b/,
  /\bdez vezes\b/,
];

const UNIT_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
};

const TEEN_WORDS: Record<string, number> = {
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};

const TENS_WORDS: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};

const HUNDREDS_WORDS: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d+),\s+(\d+)/g, "$1,$2")
    .replace(/\br\$\s*/g, " ")
    .replace(/\breais?\b/g, " ")
    .replace(/\brs\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegex(word)}\\b`).test(text);
}

function parsePtBrNumber(value: string): number | null {
  if (!value) return null;

  const clean = value.replace(/\s/g, "");

  if (clean.includes(".") && clean.includes(",")) {
    const normalized = clean.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (clean.includes(".") && !clean.includes(",")) {
    if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
      const normalized = clean.replace(/\./g, "");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  if (clean.includes(",")) {
    const normalized = clean.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function wordToNumberSingle(token: string): number | null {
  if (token in UNIT_WORDS) return UNIT_WORDS[token];
  if (token in TEEN_WORDS) return TEEN_WORDS[token];
  if (token in TENS_WORDS) return TENS_WORDS[token];
  if (token in HUNDREDS_WORDS) return HUNDREDS_WORDS[token];
  return null;
}

function parseWordsUnderThousand(tokens: string[]): number | null {
  if (!tokens.length) return null;

  let total = 0;
  let matched = false;

  for (const token of tokens) {
    if (token === "e") continue;

    const value = wordToNumberSingle(token);
    if (value === null) return null;

    total += value;
    matched = true;
  }

  return matched ? total : null;
}

function extractWordAmount(text: string): number | null {
  const longPatterns = [
    /\b((?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\s+mil(?:\s+e\s+(?:cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|e)+)?)\b/,
    /\b(mil(?:\s+e\s+(?:cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|e)+)?)\b/,
  ];

  for (const pattern of longPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const phrase = match[1].trim();
    const parts = phrase.split(/\s+/);

    const milIndex = parts.indexOf("mil");
    if (milIndex === -1) continue;

    const beforeMil = parts.slice(0, milIndex);
    const afterMil = parts.slice(milIndex + 1);

    let thousands = 1;

    if (beforeMil.length > 0) {
      const parsedThousands = parseWordsUnderThousand(beforeMil);
      if (parsedThousands === null) continue;
      thousands = parsedThousands;
    }

    let remainder = 0;
    if (afterMil.length > 0) {
      const parsedRemainder = parseWordsUnderThousand(afterMil);
      if (parsedRemainder === null) continue;
      remainder = parsedRemainder;
    }

    const total = thousands * 1000 + remainder;
    if (total > 0) return total;
  }

  if (hasWord(text, "mil")) return 1000;

  return null;
}

function extractNumericPlusMilAmount(text: string): number | null {
  const match = text.match(/\b(\d{1,3})\s+mil\b/);
  if (!match) return null;

  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) return null;

  const remainderMatch = text.match(
    /\b\d{1,3}\s+mil(?:\s+e\s+(cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|e)+)\b/
  );

  let remainder = 0;

  if (remainderMatch?.[1]) {
    const parsed = parseWordsUnderThousand(remainderMatch[1].split(/\s+/));
    if (parsed !== null) {
      remainder = parsed;
    }
  }

  return base * 1000 + remainder;
}

function findAllCandidateAmounts(text: string): number[] {
  const matches =
    text.match(/\b\d{1,3}(?:\.\d{3})*,\d{1,2}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+[.,]\d{1,2}\b|\b\d{1,6}\b/g) || [];

  return matches
    .map((item) => parsePtBrNumber(item))
    .filter((item): item is number => item !== null && item > 0 && item < 1000000);
}

function isInstallmentOnlyAmount(text: string, amount: number | null): boolean {
  if (amount === null) return false;

  const installmentSignals = INSTALLMENT_ONLY_PATTERNS.some((pattern) => pattern.test(text));
  if (!installmentSignals) return false;

  const numericAmount = String(amount);

  const matchesNumericInstallment =
    new RegExp(`\\bem\\s+${escapeRegex(numericAmount)}\\s+vezes\\b`).test(text) ||
    new RegExp(`\\b${escapeRegex(numericAmount)}\\s+vezes\\b`).test(text) ||
    new RegExp(`\\b${escapeRegex(numericAmount)}x\\b`).test(text);

  const matchesWordInstallment =
    (amount === 2 && /\bduas vezes\b/.test(text)) ||
    (amount === 3 && /\btres vezes\b/.test(text)) ||
    (amount === 4 && /\bquatro vezes\b/.test(text)) ||
    (amount === 5 && /\bcinco vezes\b/.test(text)) ||
    (amount === 6 && /\bseis vezes\b/.test(text)) ||
    (amount === 7 && /\bsete vezes\b/.test(text)) ||
    (amount === 8 && /\boito vezes\b/.test(text)) ||
    (amount === 9 && /\bnove vezes\b/.test(text)) ||
    (amount === 10 && /\bdez vezes\b/.test(text)) ||
    (amount === 11 && /\bonze vezes\b/.test(text)) ||
    (amount === 12 && /\bdoze vezes\b/.test(text));

  if (!matchesNumericInstallment && !matchesWordInstallment) {
    return false;
  }

  const explicitMoneySignals =
    /\br\$\s*\d/.test(text) ||
    /\b\d{1,3}(?:\.\d{3})*,\d{1,2}\b/.test(text) ||
    /\b\d{1,3}(?:\.\d{3})+\b/.test(text) ||
    /\b\d+\s*(reais|real)\b/.test(text) ||
    /\b\d+\s+mil\b/.test(text);

  return !explicitMoneySignals;
}

function extractAmount(text: string): number | null {
  const numericPlusMil = extractNumericPlusMilAmount(text);
  if (numericPlusMil !== null) return numericPlusMil;

  const wordAmount = extractWordAmount(text);
  if (wordAmount !== null) return wordAmount;

  const amounts = findAllCandidateAmounts(text);

  if (amounts.length > 0) {
    const first = amounts[0];
    if (isInstallmentOnlyAmount(text, first)) {
      return null;
    }
    return first;
  }

  return null;
}

function detectInstitution(text: string): string | null {
  for (const rule of INSTITUTION_RULES) {
    if (rule.keywords.some((keyword) => hasWord(text, keyword))) {
      return rule.canonical;
    }
  }

  return null;
}

function removeInstitutionNoise(text: string): string {
  return text
    .replace(/\bmercado pago\b/g, " ")
    .replace(/\bmercadopago\b/g, " ")
    .replace(/\bmpago\b/g, " ")
    .replace(/\bmp\b/g, " ")
    .replace(/\bnu bank\b/g, " ")
    .replace(/\bnubank\b/g, " ")
    .replace(/\blubank\b/g, " ")
    .replace(/\bnubenk\b/g, " ")
    .replace(/\bnubamk\b/g, " ")
    .replace(/\bbank\b/g, " ")
    .replace(/\bno bank\b/g, " ")
    .replace(/\binter pj\b/g, " ")
    .replace(/\binterpj\b/g, " ")
    .replace(/\bbanco inter\b/g, " ")
    .replace(/\binter\b/g, " ")
    .replace(/\bpicpay\b/g, " ")
    .replace(/\bpic pay\b/g, " ")
    .replace(/\bitau\b/g, " ")
    .replace(/\bitaú\b/g, " ")
    .replace(/\btau\b/g, " ")
    .replace(/\bcaixa\b/g, " ")
    .replace(/\bcef\b/g, " ")
    .replace(/\bbradesco\b/g, " ")
    .replace(/\bsantander\b/g, " ")
    .replace(/\bbb\b/g, " ")
    .replace(/\bbanco do brasil\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPaymentMethod(text: string): string | null {
  for (const rule of PAYMENT_METHOD_RULES) {
    if (rule.keywords.some((keyword) => hasWord(text, keyword))) {
      return rule.value;
    }
  }

  const hasInstallmentWords = INSTALLMENT_ONLY_PATTERNS.some((pattern) => pattern.test(text));

  if (hasInstallmentWords || hasWord(text, "passei") || hasWord(text, "cartao")) {
    return "credito";
  }

  if (hasWord(text, "banco") || hasWord(text, "conta")) {
    return hasWord(text, "pix") ? "pix" : "debito";
  }

  return null;
}

function extractInstallments(text: string): {
  installment: number | null;
  totalInstallments: number | null;
} {
  const numericPatterns = [
    /\b(\d{1,2})x\b/,
    /\bem\s+(\d{1,2})\s+vezes\b/,
    /\b(\d{1,2})\s+vezes\b/,
    /\bem\s+(\d{1,2})x\b/,
    /\bparcelado em\s+(\d{1,2})\b/,
    /\bparcelado em\s+(\d{1,2})\s+parcelas\b/,
  ];

  for (const pattern of numericPatterns) {
    const match = text.match(pattern);
    if (match) {
      const total = Number(match[1]);
      if (total > 1 && total <= 48) {
        return {
          installment: 1,
          totalInstallments: total,
        };
      }
    }
  }

  const wordInstallments: Record<string, number> = {
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
  };

  for (const [word, total] of Object.entries(wordInstallments)) {
    if (
      text.includes(`em ${word} vezes`) ||
      text.includes(`${word} vezes`) ||
      text.includes(`parcelado em ${word} vezes`) ||
      text.includes(`parcelado em ${word}`)
    ) {
      return {
        installment: 1,
        totalInstallments: total,
      };
    }
  }

  return {
    installment: null,
    totalInstallments: null,
  };
}

function detectType(text: string): ParsedMessageType {
  if (INCOME_KEYWORDS.some((keyword) => hasWord(text, keyword))) {
    return "income";
  }

  if (EXPENSE_KEYWORDS.some((keyword) => hasWord(text, keyword))) {
    return "expense";
  }

  return "unknown";
}

function detectCategory(text: string): string | null {
  const cleanText = removeInstitutionNoise(text);

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => hasWord(cleanText, keyword))) {
      return rule.category;
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => hasWord(text, keyword))) {
      return rule.category;
    }
  }

  return null;
}

function detectMerchantDescription(text: string): string | null {
  const sanitizedText = removeInstitutionNoise(text);

  if (hasWord(sanitizedText, "salario")) return "salario";
  if (hasWord(sanitizedText, "tv") || hasWord(sanitizedText, "televisao")) return "tv";

  for (const rule of MERCHANT_RULES) {
    if (rule.label === "99") {
      const hasNinetyNineContext =
        hasWord(sanitizedText, "99") &&
        (hasWord(sanitizedText, "corrida") ||
          hasWord(sanitizedText, "uber") ||
          hasWord(sanitizedText, "transporte") ||
          hasWord(sanitizedText, "app"));
      if (hasNinetyNineContext) {
        return rule.label;
      }
      continue;
    }

    if (rule.keywords.some((keyword) => hasWord(sanitizedText, keyword))) {
      return rule.label;
    }
  }

  for (const rule of MERCHANT_RULES) {
    if (rule.label === "99") continue;

    if (rule.keywords.some((keyword) => hasWord(text, keyword))) {
      return rule.label;
    }
  }

  return null;
}

function inferTypeFromInstitution(
  text: string,
  institution: string | null
): ParsedMessageType {
  if (!institution) return "unknown";

  const rule = INSTITUTION_RULES.find((item) => item.canonical === institution);
  if (!rule) return "unknown";

  if (rule.incomeHints?.some((hint) => hasWord(text, hint))) {
    return "income";
  }

  if (rule.expenseHints?.some((hint) => hasWord(text, hint))) {
    return "expense";
  }

  return "unknown";
}

function inferTypeFromContext(
  text: string,
  amount: number | null,
  currentType: ParsedMessageType,
  category: string | null,
  institution: string | null
): ParsedMessageType {
  if (currentType !== "unknown") return currentType;
  if (amount === null) return currentType;

  if (category === "receita") return "income";
  if (category === "emprestimo" && /\b(recebi|entrou|caiu)\b/.test(text)) return "income";

  if (
    [
      "alimentacao",
      "transporte",
      "saude",
      "moradia",
      "lazer",
      "educacao",
      "trabalho",
      "vestuario",
    ].includes(category || "")
  ) {
    return "expense";
  }

  const institutionType = inferTypeFromInstitution(text, institution);
  if (institutionType !== "unknown") {
    return institutionType;
  }

  if (hasWord(text, "cliente")) return "income";
  if (hasWord(text, "banco") || hasWord(text, "conta")) return "expense";

  return "unknown";
}

function extractOccurredAt(text: string): string | null {
  const now = new Date();
  const date = new Date(now);

  if (text.includes("hoje")) {
    return date.toISOString();
  }

  if (text.includes("ontem")) {
    date.setDate(date.getDate() - 1);
    return date.toISOString();
  }

  if (text.includes("anteontem")) {
    date.setDate(date.getDate() - 2);
    return date.toISOString();
  }

  const fullDateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);

  if (fullDateMatch) {
    const day = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]);
    const rawYear = fullDateMatch[3];
    const year = rawYear
      ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear)
      : now.getFullYear();

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
}

function extractPersonName(text: string): string | null {
  const patterns = [
    /\bemprestimo do ([a-z]+)\b/,
    /\bemprestimo de ([a-z]+)\b/,
    /\bdo ([a-z]+) no pix\b/,
    /\bde ([a-z]+) no pix\b/,
    /\bdo ([a-z]+) na conta\b/,
    /\bde ([a-z]+) na conta\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function stripKnownPatterns(text: string): string {
  return text
    .replace(/\b\d{1,3}(?:\.\d{3})*,\d{1,2}\b/g, " ")
    .replace(/\b\d{1,3}(?:\.\d{3})+\b/g, " ")
    .replace(/\b\d+[.,]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,6}\b/g, " ")
    .replace(/\b(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\s+mil(?:\s+e\s+(?:cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|e)+)?\b/g, " ")
    .replace(/\b\d{1,3}\s+mil(?:\s+e\s+(?:cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|e)+)?\b/g, " ")
    .replace(/\bmil(?:\s+e\s+(?:cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|e)+)?\b/g, " ")
    .replace(/\b\d{1,2}x\b/g, " ")
    .replace(/\bem\s+\d{1,2}\s+vezes\b/g, " ")
    .replace(/\b\d{1,2}\s+vezes\b/g, " ")
    .replace(/\bem\s+\d{1,2}x\b/g, " ")
    .replace(/\bem duas vezes\b/g, " ")
    .replace(/\bduas vezes\b/g, " ")
    .replace(/\bem tres vezes\b/g, " ")
    .replace(/\btres vezes\b/g, " ")
    .replace(/\bem quatro vezes\b/g, " ")
    .replace(/\bquatro vezes\b/g, " ")
    .replace(/\bem cinco vezes\b/g, " ")
    .replace(/\bcinco vezes\b/g, " ")
    .replace(/\bem seis vezes\b/g, " ")
    .replace(/\bseis vezes\b/g, " ")
    .replace(/\bem sete vezes\b/g, " ")
    .replace(/\bsete vezes\b/g, " ")
    .replace(/\bem oito vezes\b/g, " ")
    .replace(/\boito vezes\b/g, " ")
    .replace(/\bem nove vezes\b/g, " ")
    .replace(/\bnove vezes\b/g, " ")
    .replace(/\bem dez vezes\b/g, " ")
    .replace(/\bdez vezes\b/g, " ")
    .replace(/\bhoje\b/g, " ")
    .replace(/\bontem\b/g, " ")
    .replace(/\banteontem\b/g, " ")
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-](\d{2,4}))?\b/g, " ");
}

function removeTerms(text: string, terms: string[]): string {
  let output = text;

  for (const term of terms.sort((a, b) => b.length - a.length)) {
    const escaped = escapeRegex(term);
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ");
  }

  return output;
}

function cleanupDescription(text: string): string {
  return text
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bdo emprestimo do\b/g, "emprestimo ")
    .replace(/\bdo emprestimo de\b/g, "emprestimo ")
    .replace(/\bde emprestimo do\b/g, "emprestimo ")
    .replace(/\bde emprestimo de\b/g, "emprestimo ")
    .trim();
}

function buildDescription(
  originalText: string,
  normalizedText: string,
  institution: string | null,
  category: string | null
): string | null {
  const institutionKeywords = INSTITUTION_RULES.flatMap((item) => item.keywords);

  const personName = extractPersonName(normalizedText);
  if (category === "emprestimo" && personName) {
    return `emprestimo ${personName}`;
  }

  if (hasWord(normalizedText, "cliente")) {
    return "cliente";
  }

  const merchantDescription = detectMerchantDescription(normalizedText);
  if (merchantDescription) {
    return merchantDescription;
  }

  if (category === "receita" && hasWord(normalizedText, "salario")) {
    return "salario";
  }

  const removableTerms = [
    ...INCOME_KEYWORDS,
    ...EXPENSE_KEYWORDS,
    ...institutionKeywords,
    ...GENERIC_STOPWORDS,
    "cartao de credito",
    "cartao de debito",
    "credito",
    "debito",
    "pix",
    "dinheiro",
    "boleto",
    "fatura",
    "receita",
    "despesa",
    "na conta",
    "conta pj",
    "pj",
    "vezes",
  ];

  let description = stripKnownPatterns(normalizedText);
  description = removeTerms(description, removableTerms);
  description = cleanupDescription(description);

  if (hasWord(description, "salario")) {
    return "salario";
  }

  if (hasWord(description, "tv") || hasWord(description, "televisao")) {
    return "tv";
  }

  if (institution && description.length > 0) {
    return description;
  }

  if (!description) {
    return originalText.trim() || null;
  }

  return description;
}

function inferPaymentMethodFromContext(
  text: string,
  currentPaymentMethod: string | null,
  installments: { installment: number | null; totalInstallments: number | null },
  institution: string | null
): string | null {
  if (currentPaymentMethod) return currentPaymentMethod;

  if (installments.totalInstallments && installments.totalInstallments > 1) {
    return "credito";
  }

  if (hasWord(text, "passei") || hasWord(text, "cartao") || hasWord(text, "fatura")) {
    return "credito";
  }

  if (hasWord(text, "boleto")) return "boleto";
  if (hasWord(text, "transferencia")) return "transferencia";

  if (institution) {
    if (hasWord(text, "pix")) return "pix";
    if (hasWord(text, "banco") || hasWord(text, "conta")) return "debito";
  }

  return null;
}

function refineDescriptionFallback(
  originalText: string,
  parsed: ParsedMessageResult,
  institution: string | null
): string | null {
  if (parsed.description && parsed.description.length >= 3) {
    return parsed.description;
  }

  if (parsed.category === "emprestimo") {
    const personMatch = extractPersonName(parsed.normalizedText);
    if (personMatch) {
      return `emprestimo ${personMatch}`;
    }
    return "emprestimo";
  }

  if (hasWord(parsed.normalizedText, "cliente")) {
    return "cliente";
  }

  if (hasWord(parsed.normalizedText, "salario")) {
    return "salario";
  }

  if (hasWord(parsed.normalizedText, "tv") || hasWord(parsed.normalizedText, "televisao")) {
    return "tv";
  }

  const merchantDescription = detectMerchantDescription(parsed.normalizedText);
  if (merchantDescription) {
    return merchantDescription;
  }

  if (parsed.category && parsed.category !== "receita") {
    return parsed.category;
  }

  if (parsed.category === "receita") {
    return "receita";
  }

  if (institution) {
    return institution;
  }

  if (parsed.type === "income") {
    return originalText.trim() || "receita";
  }

  if (parsed.type === "expense") {
    return originalText.trim() || "despesa";
  }

  return originalText.trim() || null;
}

function isValidFinancial(parsed: ParsedMessageResult): boolean {
  if (parsed.type === "unknown") return false;
  if (parsed.amount === null || parsed.amount <= 0) return false;

  if (
    parsed.totalInstallments &&
    parsed.totalInstallments > 1 &&
    parsed.amount !== null &&
    parsed.amount === parsed.totalInstallments &&
    !/\br\$\s*\d/i.test(parsed.originalText) &&
    !/\b\d+\s*(reais|real)\b/i.test(parsed.originalText) &&
    !/\b\d+\s+mil\b/i.test(parsed.originalText)
  ) {
    return false;
  }

  return true;
}

export function parseFinancialMessage(text: string): ParsedMessageResult {
  const normalizedText = normalizeText(text);
  const amount = extractAmount(normalizedText);
  const category = detectCategory(normalizedText);
  const institution = detectInstitution(normalizedText);
  const detectedType = detectType(normalizedText);
  const finalType = inferTypeFromContext(
    normalizedText,
    amount,
    detectedType,
    category,
    institution
  );
  const installments = extractInstallments(normalizedText);
  const paymentMethod = inferPaymentMethodFromContext(
    normalizedText,
    detectPaymentMethod(normalizedText),
    installments,
    institution
  );
  const occurredAt = extractOccurredAt(normalizedText);

  const parsed: ParsedMessageResult = {
    originalText: text,
    normalizedText,
    amount,
    type: finalType,
    category,
    description: buildDescription(text, normalizedText, institution, category),
    paymentMethod,
    installment: installments.installment,
    totalInstallments: installments.totalInstallments,
    occurredAt,
  };

  const finalParsed: ParsedMessageResult = {
    ...parsed,
    description: refineDescriptionFallback(text, parsed, institution),
  };

  if (!isValidFinancial(finalParsed)) {
    return {
      ...finalParsed,
      type: "unknown",
      amount: null,
    };
  }

  return finalParsed;
}