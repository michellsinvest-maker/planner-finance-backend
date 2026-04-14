import path from "node:path";
import fs from "node:fs";
import qrcode from "qrcode-terminal";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  downloadContentFromMessage,
} from "@whiskeysockets/baileys";
import { speechToTextService } from "./speech-to-text.service";
import { textNormalizerService } from "./text-normalizer.service";

type WhatsAppConnectionState =
  | "idle"
  | "starting"
  | "qr"
  | "connected"
  | "disconnected"
  | "error";

interface WhatsAppStatus {
  enabled: boolean;
  state: WhatsAppConnectionState;
  isAuthenticated: boolean;
  hasQr: boolean;
  lastQr?: string | null;
  authPath: string;
  me?: string | null;
  lastError?: string | null;
  lastIncomingText?: string | null;
  lastSavedRecordId?: string | null;
  lastReply?: string | null;
}

interface SaveMessageResponse {
  ok?: boolean;
  message?: string;
  data?: any;
  saved?: any;
  parsed?: any;
  id?: string | null;
  status?: number;
  error?: string | null;
  code?: string | null;
  financialImpact?: {
    sourceType?: string | null;
    sourceName?: string | null;
    paymentMethod?: string | null;
    installments?: {
      current: number;
      total: number;
    } | null;
  };
  [key: string]: any;
}

interface NormalizedSavedData {
  id: string | null;
  amount: number | null;
  type: string | null;
  category: string | null;
  description: string | null;
  originalText: string | null;
  normalizedText: string | null;
  createdAt: string | null;
  occurredAt: string | null;
  installment: number | null;
  totalInstallments: number | null;
  paymentMethod: string | null;
  sourceType: string | null;
  sourceName: string | null;
}

class WhatsAppService {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private isStarting = false;
  private authPath = path.resolve(process.cwd(), "auth", "baileys");
  private dueDebtTimer: NodeJS.Timeout | null = null;
  private reminderRegistry = new Map<string, string>();
  private status: WhatsAppStatus = {
    enabled: true,
    state: "idle",
    isAuthenticated: false,
    hasQr: false,
    lastQr: null,
    authPath: path.resolve(process.cwd(), "auth", "baileys"),
    me: null,
    lastError: null,
    lastIncomingText: null,
    lastSavedRecordId: null,
    lastReply: null,
  };

  public getStatus(): WhatsAppStatus {
    return { ...this.status };
  }

  public async start(): Promise<void> {
    if (this.socket || this.isStarting) {
      return;
    }

    this.isStarting = true;
    this.status.state = "starting";
    this.status.lastError = null;

    try {
      fs.mkdirSync(this.authPath, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
      const { version } = await fetchLatestBaileysVersion();

      this.socket = makeWASocket({
        version,
        auth: state,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        browser: ["Planner Finance", "Chrome", "1.0.0"],
      });

      this.socket.ev.on("creds.update", saveCreds);

      this.socket.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          this.status.state = "qr";
          this.status.hasQr = true;
          this.status.lastQr = qr;
          this.status.lastError = null;

          console.log("\n==================================================");
          console.log("WHATSAPP: QR CODE GERADO");
          console.log("Abra o WhatsApp no celular > Aparelhos conectados > Conectar um aparelho");
          console.log("Escaneie o QR code abaixo:");
          console.log("==================================================\n");

          qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
          this.status.state = "connected";
          this.status.hasQr = false;
          this.status.lastQr = null;
          this.status.isAuthenticated = true;
          this.status.lastError = null;
          this.status.me = this.socket?.user?.id ?? null;

          console.log("WHATSAPP CONECTADO COM SUCESSO");
          this.startDueDebtMonitor();
          void this.checkDueDebtsAndNotify();
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          this.status.state = "disconnected";
          this.status.isAuthenticated = false;
          this.status.me = null;

          if (statusCode === DisconnectReason.loggedOut) {
            this.status.lastError =
              "Sessão desconectada porque o WhatsApp fez logout. Será necessário gerar QR novamente.";
            this.socket = null;
            console.error("WHATSAPP DESLOGADO. Gere um novo QR code.");
            return;
          }

          this.socket = null;
          this.stopDueDebtMonitor();
          console.warn("WHATSAPP DESCONECTADO. Tentando reconectar...");

          if (shouldReconnect) {
            setTimeout(() => {
              void this.start();
            }, 3000);
          }
        }
      });

      this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") {
          return;
        }

        for (const message of messages) {
          try {
            if (!message.key?.remoteJid) {
              continue;
            }

            if (message.key.fromMe) {
              continue;
            }

            const remoteJid = message.key.remoteJid;

            if (remoteJid.endsWith("@g.us")) {
              continue;
            }

            if (remoteJid === "status@broadcast") {
              continue;
            }

            const textMessage =
              message.message?.conversation ||
              message.message?.extendedTextMessage?.text ||
              message.message?.imageMessage?.caption ||
              message.message?.videoMessage?.caption ||
              "";

            const hasAudio = !!message.message?.audioMessage;

            let finalText = textMessage.trim();
            let transcriptionPrefix = "";

            if (!finalText && hasAudio) {
              console.log("ÁUDIO RECEBIDO DO WHATSAPP");
              console.log("Iniciando download e transcrição local...");

              const audioBuffer = await this.downloadAudioBuffer(message.message!.audioMessage!);
              const transcription = await speechToTextService.transcribeFromBuffer(audioBuffer, "ogg");

              if (!transcription.ok || !transcription.text) {
                const failAudioReply =
                  "❌ Recebi seu áudio, mas não consegui transcrever agora. Tente falar novamente de forma mais clara.";
                await this.sendText(remoteJid, failAudioReply);
                this.status.lastReply = failAudioReply;
                continue;
              }

              const normalizedAudio = textNormalizerService.normalizeAll(transcription.text);
              finalText = normalizedAudio.displayText;
              transcriptionPrefix = `🎤 Áudio entendido: ${normalizedAudio.displayText}\n\n`;

              console.log("TRANSCRIÇÃO DO ÁUDIO:");
              console.log(normalizedAudio.displayText);
            }

            if (!finalText) {
              continue;
            }

            const normalizedInput = textNormalizerService.normalizeAll(finalText);
            finalText = normalizedInput.displayText;

            this.status.lastIncomingText = finalText;

            console.log("MENSAGEM RECEBIDA DO WHATSAPP");
            console.log(`Texto: ${finalText}`);

            const debtPayload = this.extractDebtPayload(normalizedInput.parserText);
            if (debtPayload) {
              const debtResult = await this.sendDebtToBackend(debtPayload);

              if (!debtResult.ok) {
                const failDebtReply =
                  "❌ Não consegui cadastrar essa conta a vencer agora. Verifique o valor e a data e tente novamente.";
                await this.sendText(remoteJid, failDebtReply);
                this.status.lastReply = failDebtReply;
                continue;
              }

              const successDebtReply =
                transcriptionPrefix + this.buildDebtSuccessReply(debtPayload, debtResult);

              this.status.lastReply = successDebtReply;
              await this.sendText(remoteJid, successDebtReply);
              continue;
            }

            const saveResult = await this.sendIncomingTextToBackend(normalizedInput.parserText);

            console.log("RETORNO BRUTO DO BACKEND /api/messages:");
            console.dir(saveResult, { depth: null });

            if (!saveResult.ok) {
              const failReply = transcriptionPrefix + this.buildInvalidFinancialReply(saveResult);
              await this.sendText(remoteJid, failReply);
              this.status.lastReply = failReply;
              continue;
            }

            const normalized = this.extractSavedData(saveResult);
            const successReply =
              transcriptionPrefix +
              this.buildSuccessReply(
                normalized,
                normalizedInput.displayText,
                saveResult
              );

            this.status.lastSavedRecordId = normalized.id ?? null;
            this.status.lastReply = successReply;

            await this.sendText(remoteJid, successReply);
          } catch (error: any) {
            this.status.lastError =
              error?.message ?? "Erro inesperado ao processar mensagem recebida.";
            console.error("Erro ao processar mensagem do WhatsApp:", error);
          }
        }
      });
    } catch (error: any) {
      this.status.state = "error";
      this.status.lastError =
        error?.message ?? "Falha desconhecida ao iniciar o WhatsApp.";
      this.socket = null;
      console.error("Erro ao iniciar WhatsApp:", error);
    } finally {
      this.isStarting = false;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (this.socket) {
        await this.socket.logout();
      }
    } catch {
      // ignora
    } finally {
      this.socket = null;
      this.stopDueDebtMonitor();
      this.status.state = "idle";
      this.status.isAuthenticated = false;
      this.status.hasQr = false;
      this.status.lastQr = null;
      this.status.me = null;
    }
  }

  private async downloadAudioBuffer(audioMessage: any): Promise<Buffer> {
    const stream = await downloadContentFromMessage(audioMessage, "audio");
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  private async sendIncomingTextToBackend(text: string): Promise<SaveMessageResponse> {
    const port = process.env.PORT || "3333";
    const baseUrl = `http://127.0.0.1:${port}`;

    const response = await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json?.error ?? json?.message ?? "Erro ao salvar mensagem no backend.",
        ...json,
      };
    }

    return {
      ok: true,
      ...json,
    };
  }

  private buildInvalidFinancialReply(saveResult: SaveMessageResponse): string {
    const code = String(saveResult.error || saveResult.code || "").toUpperCase();
    const message = String(saveResult.message || "").toLowerCase();

    if (
      code.includes("INVALID_FINANCIAL_MESSAGE") ||
      message.includes("nao e um lancamento financeiro valido") ||
      message.includes("não é um lançamento financeiro válido")
    ) {
      return [
        "⚠️ Não identifiquei um lançamento financeiro válido nessa mensagem.",
        "",
        "Exemplos que funcionam bem:",
        "* Gastei 45 no Uber hoje",
        "* Recebi 1500 no Pix",
        "* Comprei uma TV de 3 mil em 10x no crédito",
        "* Gastei 100 no Pix no posto",
      ].join("\n");
    }

    if (code.includes("DEBT_INTENT_DETECTED")) {
      return [
        "⚠️ Entendi que isso parece uma conta a vencer, não uma transação comum.",
        "",
        "Exemplo:",
        "* Tenho uma conta de 500 do cartão Nubank que vence dia 20",
      ].join("\n");
    }

    return "❌ Não consegui registrar sua transação agora.\nTente novamente em instantes.";
  }

  private extractSavedData(saveResult: SaveMessageResponse): NormalizedSavedData {
    const candidates = [
      saveResult,
      saveResult.data,
      saveResult.saved,
      saveResult.parsed,
      saveResult.data?.saved,
      saveResult.data?.parsed,
      saveResult.data?.message,
      saveResult.message,
    ].filter(Boolean);

    let id: string | null = null;
    let amount: number | null = null;
    let type: string | null = null;
    let category: string | null = null;
    let description: string | null = null;
    let originalText: string | null = null;
    let normalizedText: string | null = null;
    let createdAt: string | null = null;
    let occurredAt: string | null = null;
    let installment: number | null = null;
    let totalInstallments: number | null = null;
    let paymentMethod: string | null = null;
    let sourceType: string | null = null;
    let sourceName: string | null = null;

    for (const item of candidates) {
      if (!item || typeof item !== "object") {
        continue;
      }

      if (!id) {
        id = item.id ?? item.messageId ?? item.recordId ?? item.data?.id ?? null;
      }

      if (amount === null || amount === undefined) {
        const rawAmount =
          item.amount ?? item.parsedAmount ?? item.value ?? item.total ?? item.data?.amount ?? null;

        amount =
          typeof rawAmount === "number"
            ? rawAmount
            : rawAmount !== null && rawAmount !== undefined && !Number.isNaN(Number(rawAmount))
              ? Number(rawAmount)
              : null;
      }

      if (!type) {
        type = item.type ?? item.transactionType ?? item.entryType ?? item.data?.type ?? null;
      }

      if (!category) {
        category = item.category ?? item.parsedCategory ?? item.group ?? item.data?.category ?? null;
      }

      if (!description) {
        description = item.description ?? item.title ?? item.label ?? item.data?.description ?? null;
      }

      if (!originalText) {
        originalText = item.originalText ?? item.text ?? item.data?.originalText ?? null;
      }

      if (!normalizedText) {
        normalizedText = item.normalizedText ?? item.data?.normalizedText ?? null;
      }

      if (!createdAt) {
        createdAt = item.createdAt ?? item.data?.createdAt ?? null;
      }

      if (!occurredAt) {
        occurredAt = item.occurredAt ?? item.data?.occurredAt ?? null;
      }

      if (installment === null || installment === undefined) {
        const rawInstallment = item.installment ?? item.currentInstallment ?? item.data?.installment ?? null;
        installment =
          rawInstallment !== null &&
          rawInstallment !== undefined &&
          !Number.isNaN(Number(rawInstallment))
            ? Number(rawInstallment)
            : null;
      }

      if (totalInstallments === null || totalInstallments === undefined) {
        const rawTotalInstallments =
          item.totalInstallments ?? item.installments ?? item.data?.totalInstallments ?? null;

        totalInstallments =
          rawTotalInstallments !== null &&
          rawTotalInstallments !== undefined &&
          !Number.isNaN(Number(rawTotalInstallments))
            ? Number(rawTotalInstallments)
            : null;
      }

      if (!paymentMethod) {
        paymentMethod =
          item.paymentMethod ??
          item.financialImpact?.paymentMethod ??
          item.data?.paymentMethod ??
          null;
      }

      if (!sourceType) {
        sourceType =
          item.sourceType ??
          item.financialImpact?.sourceType ??
          item.data?.sourceType ??
          null;
      }

      if (!sourceName) {
        sourceName =
          item.sourceName ??
          item.financialImpact?.sourceName ??
          item.data?.sourceName ??
          null;
      }
    }

    if (!paymentMethod) {
      paymentMethod = saveResult.financialImpact?.paymentMethod ?? null;
    }

    if (!sourceType) {
      sourceType = saveResult.financialImpact?.sourceType ?? null;
    }

    if (!sourceName) {
      sourceName = saveResult.financialImpact?.sourceName ?? null;
    }

    return {
      id,
      amount,
      type,
      category,
      description,
      originalText,
      normalizedText,
      createdAt,
      occurredAt,
      installment,
      totalInstallments,
      paymentMethod,
      sourceType,
      sourceName,
    };
  }

  private buildSuccessReply(
    data: NormalizedSavedData,
    incomingText: string,
    backendResponse?: SaveMessageResponse
  ): string {
    const baseText = textNormalizerService.normalizeForDisplay(
      data.description || data.originalText || incomingText
    );

    const displayName = this.inferDisplayName(baseText);
    const category = this.mapCategoryLabel(data.category || this.inferCategory(baseText) || "Outros");
    const typeLabel = this.mapTypeLabel(data.type);
    const amountLabel = this.formatCurrency(data.amount);
    const dateLabel = this.formatDate(data.occurredAt || data.createdAt);

    const paymentMethod =
      backendResponse?.financialImpact?.paymentMethod ||
      data.paymentMethod ||
      this.inferPaymentMethod(baseText, data.type);

    const sourceName =
      backendResponse?.financialImpact?.sourceName ||
      data.sourceName ||
      null;

    const installment =
      backendResponse?.financialImpact?.installments ||
      (
        data.installment !== null &&
        data.totalInstallments !== null &&
        data.totalInstallments > 1
          ? {
              current: data.installment,
              total: data.totalInstallments,
            }
          : null
      );

    const paymentStatusLabel = this.mapPaymentStatusLabel(data.type, paymentMethod);

    const lines = [
      "✅ Transação criada com sucesso!",
      "",
      `📝 ${displayName}`,
      `💰 ${amountLabel}`,
      `📊 Tipo: ${typeLabel}`,
      `📅 Data: ${dateLabel}`,
      `🏷️ Categoria: ${category}`,
      `💳 Pagamento: ${this.formatPaymentLabel(paymentMethod)}`,
    ];

    if (sourceName) {
      lines.push(`🏦 Origem: ${sourceName}`);
    }

    if (installment) {
      lines.push(`🔢 Parcela: ${installment.current}/${installment.total}`);
    }

    lines.push(`✔ ${paymentStatusLabel}`);

    return lines.join("\n");
  }

  private inferDisplayName(text: string | null): string {
    const display = textNormalizerService.normalizeForDisplay(text || "");
    const originalMatch = textNormalizerService.normalizeForMatch(display);
    const merchantMatch = originalMatch
      .replace(/\b(?:o\s+)?mercado pago\b/g, " ")
      .replace(/\bmercadopago\b/g, " ")
      .replace(/\bmpago\b/g, " ")
      .replace(/\bmp\b/g, " ")
      .replace(/\bdo cartao do bank\b/g, " cartao nubank ")
      .replace(/\bdo cartao do nubank\b/g, " cartao nubank ")
      .replace(/\bdo cartao nubank\b/g, " cartao nubank ")
      .replace(/\bbank\b/g, " nubank ")
      .replace(/\s+/g, " ")
      .trim();

    if (merchantMatch.includes("supermercado")) return "Supermercado";
    if (merchantMatch.includes("padaria")) return "Padaria";
    if (merchantMatch.includes("mercado")) return "Mercado";
    if (merchantMatch.includes("farmacia")) return "Farmácia";
    if (merchantMatch.includes("posto") || merchantMatch.includes("gasolina") || merchantMatch.includes("combust")) return "Posto";
    if (merchantMatch.includes("uber")) return "Uber";
    if (merchantMatch === "99" || merchantMatch.startsWith("99 ") || merchantMatch.endsWith(" 99") || merchantMatch.includes(" 99 ")) return "99";
    if (merchantMatch.includes("ifood")) return "iFood";
    if (merchantMatch.includes("academia")) return "Academia";
    if (merchantMatch.includes("aluguel")) return "Aluguel";
    if (merchantMatch.includes("internet")) return "Internet";
    if (merchantMatch.includes("agua")) return "Água";
    if (merchantMatch.includes("luz") || merchantMatch.includes("energia")) return "Luz";
    if (merchantMatch.includes("condominio")) return "Condomínio";

    if (originalMatch.includes("mercado pago")) return "Mercado Pago";
    if (originalMatch.includes("cartao nubank") || originalMatch.includes("nubank") || /\bbank\b/.test(originalMatch)) return "Cartão Nubank";
    if (originalMatch.includes("inter")) return "Inter";
    if (originalMatch.includes("picpay")) return "PicPay";
    if (originalMatch.includes("deposito")) return "Depósito";
    if (originalMatch.includes("salario")) return "Salário";
    if (originalMatch.includes("cliente")) return "Cliente";
    if (originalMatch.includes("emprestimo")) return "Empréstimo";

    const cleaned = display
      .replace(/^gastei\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^paguei\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^ganhei\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^recebi\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^entrou\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^caiu\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^tenho\s+uma\s+conta\s+de\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^tenham\s+uma\s+conta\s+de\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^tenho\s+uma\s+conta\s+do\s+/i, "")
      .replace(/^tenham\s+uma\s+conta\s+do\s+/i, "")
      .replace(/^tenho\s+uma\s+conta\s+da\s+/i, "")
      .replace(/^tenham\s+uma\s+conta\s+da\s+/i, "")
      .replace(/^tenho\s+um\s+boleto\s+de\s+\d+[.,]?\d*\s*/i, "")
      .replace(/^conta\s+de\s+\d+[.,]?\d*\s*/i, "")
      .replace(/\b(parceladas?|parcelado|parcelada)\b/gi, "")
      .replace(/\bem \d{1,2} vezes\b/gi, "")
      .replace(/\b\d{1,2}x\b/gi, "")
      .replace(/\b(?:o\s+)?mercado pago\b/gi, "")
      .replace(/\bmercadopago\b/gi, "")
      .replace(/\bmpago\b/gi, "")
      .replace(/\bno cartao\b/gi, "")
      .replace(/\bna conta\b/gi, "")
      .replace(/\bvia pix\b/gi, "")
      .replace(/\b(no|na|em|via)\s+pix\b/gi, "")
      .replace(/\b(no|na|em|via)\s+dinheiro\b/gi, "")
      .replace(/\b(no|na|em|via)\s+d[ée]bito\b/gi, "")
      .replace(/\b(no|na|em|via)\s+cr[ée]dito\b/gi, "")
      .replace(/\bcart[ãa]o de d[ée]bito\b/gi, "")
      .replace(/\bcart[ãa]o de cr[ée]dito\b/gi, "")
      .replace(/^\s*(no|na|em|de|do|da)\s+/i, "")
      .replace(/\bque vence dia \d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/gi, "")
      .replace(/\bvence dia \d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/gi, "")
      .replace(/\bvem esse dia \d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/gi, "")
      .replace(/\bvem dia \d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/gi, "")
      .replace(/\bdo cartao do bank\b/gi, "Cartão Nubank")
      .replace(/\bdo cartao do nubank\b/gi, "Cartão Nubank")
      .replace(/\bdo cartao nubank\b/gi, "Cartão Nubank")
      .replace(/\bbank\b/gi, "Nubank")
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();

    return this.toTitleCase(cleaned) || "Transação";
  }

  private inferCategory(text: string | null): string | null {
    const value = textNormalizerService.normalizeForMatch(text || "");

    if (
      value.includes("mercado") ||
      value.includes("supermercado") ||
      value.includes("padaria") ||
      value.includes("pao")
    ) {
      return "Alimentação";
    }

    if (
      value.includes("farmacia") ||
      value.includes("remedio")
    ) {
      return "Saúde";
    }

    if (
      value.includes("posto") ||
      value.includes("gasolina") ||
      value.includes("etanol") ||
      value.includes("diesel") ||
      value.includes("combust") ||
      value.includes("uber") ||
      value.includes("99") ||
      value.includes("onibus")
    ) {
      return "Transporte";
    }

    if (value.includes("aluguel") || value.includes("condominio")) {
      return "Moradia";
    }

    if (
      value.includes("luz") ||
      value.includes("energia") ||
      value.includes("agua") ||
      value.includes("internet")
    ) {
      return "Contas";
    }

    if (
      value.includes("salario") ||
      value.includes("recebi") ||
      value.includes("ganhei") ||
      value.includes("cliente")
    ) {
      return "Receitas";
    }

    if (value.includes("emprestimo")) {
      return "Empréstimo";
    }

    if (value.includes("cartao")) {
      return "Cartão";
    }

    return null;
  }

  private inferPaymentMethod(text: string | null, type?: string | null): string {
    const value = textNormalizerService.normalizeForMatch(text || "");

    if (value.includes("pix")) return "Pix";
    if (value.includes("dinheiro") || value.includes("especie")) return "Dinheiro";
    if (value.includes("debito")) return "Débito";
    if (value.includes("credito") || value.includes("parcelado") || value.includes("passei")) return "Crédito";

    if (String(type || "").toLowerCase() === "expense") return "Débito";
    if (String(type || "").toLowerCase() === "income") return "Transferência";

    return "Não informado";
  }

  private startDueDebtMonitor() {
    if (this.dueDebtTimer) {
      return;
    }

    this.dueDebtTimer = setInterval(() => {
      void this.checkDueDebtsAndNotify();
    }, 1000 * 60 * 60);
  }

  private stopDueDebtMonitor() {
    if (this.dueDebtTimer) {
      clearInterval(this.dueDebtTimer);
      this.dueDebtTimer = null;
    }
  }

  private extractDebtPayload(text: string): {
    title: string;
    creditor: string | null;
    totalAmount: number;
    dueDate: string | null;
    amountPaid: number;
    notes: string | null;
    status: "open";
  } | null {
    const normalized = textNormalizerService.normalizeForMatch(text || "");

    const hasDebtSubject =
      normalized.includes("tenho uma conta") ||
      normalized.includes("tenham uma conta") ||
      normalized.includes("conta a vencer") ||
      normalized.includes("conta que vence") ||
      normalized.includes("conta vence") ||
      normalized.includes("boleto que vence") ||
      normalized.includes("boleto vence") ||
      normalized.includes("fatura que vence") ||
      normalized.includes("fatura vence") ||
      normalized.includes("cartao do") ||
      normalized.includes("cartao da");

    const hasDueSignal =
      normalized.includes("vencimento dia") ||
      normalized.includes("vence dia") ||
      normalized.includes("que vence") ||
      normalized.includes("vem esse dia") ||
      normalized.includes("vem dia") ||
      /\bdia\s*\d{1,2}\b/.test(normalized);

    if (!(hasDebtSubject && hasDueSignal)) {
      return null;
    }

    const amountMatch = normalized.match(/\b(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+[.,]\d{1,2}|\d{1,6})\b/);
    if (!amountMatch) {
      return null;
    }

    const rawAmount = amountMatch[1].replace(/\./g, "").replace(",", ".");
    const totalAmount = Number(rawAmount);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return null;
    }

    const dueDate = this.extractDebtDueDate(normalized);
    if (!dueDate) {
      return null;
    }

    const creditor = this.extractCreditorName(normalized);
    const title = creditor
      ? normalized.includes("cartao") || normalized.includes("fatura")
        ? `Cartão ${creditor}`
        : `Conta ${creditor}`
      : "Conta a vencer";

    return {
      title,
      creditor,
      totalAmount,
      dueDate,
      amountPaid: 0,
      notes: "Cadastro criado automaticamente pelo WhatsApp.",
      status: "open",
    };
  }

  private extractDebtDueDate(text: string): string | null {
    const explicitDateMatch = text.match(/(?:vence dia|vencimento dia|para dia|vem esse dia|vem dia|dia)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (explicitDateMatch) {
      const day = Number(explicitDateMatch[1]);
      const month = Number(explicitDateMatch[2]);
      const year = explicitDateMatch[3]
        ? Number(explicitDateMatch[3].length === 2 ? `20${explicitDateMatch[3]}` : explicitDateMatch[3])
        : new Date().getFullYear();

      return this.buildIsoDate(year, month, day);
    }

    const dayOnlyMatch = text.match(/(?:vence dia|vencimento dia|para dia|vem esse dia|vem dia|dia)\s*(\d{1,2})\b/);
    if (dayOnlyMatch) {
      const targetDay = Number(dayOnlyMatch[1]);
      const now = new Date();
      let year = now.getFullYear();
      let month = now.getMonth() + 1;

      if (targetDay < now.getDate()) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }

      return this.buildIsoDate(year, month, targetDay);
    }

    return null;
  }

  private buildIsoDate(year: number, month: number, day: number): string | null {
    if (!year || !month || !day) return null;

    const candidate = new Date(year, month - 1, day);
    if (Number.isNaN(candidate.getTime())) return null;

    return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;
  }

  private extractCreditorName(text: string): string | null {
    if (text.includes("nubank") || /\bbank\b/.test(text)) return "Nubank";
    if (text.includes("mercado pago")) return "Mercado Pago";
    if (text.includes("inter")) return "Inter";
    if (text.includes("picpay")) return "PicPay";
    if (text.includes("itau") || text.includes("itaú")) return "Itaú";
    if (text.includes("bradesco")) return "Bradesco";
    if (text.includes("santander")) return "Santander";
    if (text.includes("caixa")) return "Caixa";
    if (text.includes("btg")) return "BTG Pactual";
    if (text.includes("pagbank")) return "PagBank";
    if (text.includes("brasil") || /\bbb\b/.test(text)) return "Banco do Brasil";

    return null;
  }

  private async sendDebtToBackend(payload: {
    title: string;
    creditor: string | null;
    totalAmount: number;
    dueDate: string | null;
    amountPaid: number;
    notes: string | null;
    status: "open";
  }): Promise<SaveMessageResponse> {
    const port = process.env.PORT || "3333";
    const baseUrl = `http://127.0.0.1:${port}`;

    const response = await fetch(`${baseUrl}/api/debts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json?.message ?? "Erro ao cadastrar conta a vencer.",
        ...json,
      };
    }

    return {
      ok: true,
      ...json,
    };
  }

  private buildDebtSuccessReply(
    payload: {
      title: string;
      creditor: string | null;
      totalAmount: number;
      dueDate: string | null;
    },
    backendResponse?: SaveMessageResponse
  ) {
    const saved = backendResponse?.data || {};
    const title = saved.title || payload.title || "Conta a vencer";
    const creditor = saved.creditor || payload.creditor || null;
    const amount = typeof saved.totalAmount === "number" ? saved.totalAmount : payload.totalAmount;
    const dueDate = saved.dueDate || payload.dueDate;

    const lines = [
      "✅ Conta a vencer cadastrada com sucesso!",
      "",
      `📝 ${title}`,
      `💰 ${this.formatCurrency(amount)}`,
      `📅 Vencimento: ${this.formatDate(dueDate)}`,
      `📌 Status: Aberta`,
    ];

    if (creditor) {
      lines.push(`🏦 Credor: ${creditor}`);
    }

    lines.push("🔔 O WhatsApp vai te avisar quando estiver perto do vencimento.");

    return lines.join("\n");
  }

  private async checkDueDebtsAndNotify(): Promise<void> {
    try {
      if (!this.socket?.user?.id) {
        return;
      }

      const port = process.env.PORT || "3333";
      const baseUrl = `http://127.0.0.1:${port}`;

      const response = await fetch(`${baseUrl}/api/debts/upcoming?days=3`);
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !Array.isArray(json?.data)) {
        return;
      }

      for (const debt of json.data) {
        const daysUntilDue = Number(debt.daysUntilDue);
        const debtId = String(debt.id || "");
        const dueDate = debt.dueDate ? new Date(debt.dueDate) : null;
        const dueKey =
          dueDate && !Number.isNaN(dueDate.getTime())
            ? `${dueDate.getFullYear()}-${dueDate.getMonth() + 1}-${dueDate.getDate()}`
            : "sem-data";

        const triggerKey = `${debtId}:${daysUntilDue}:${dueKey}`;
        if (this.reminderRegistry.get(triggerKey)) {
          continue;
        }

        let title = "⚠️ Conta próxima do vencimento";
        if (daysUntilDue === 0) {
          title = "🚨 Conta vence hoje";
        } else if (daysUntilDue === 1) {
          title = "⚠️ Conta vence amanhã";
        }

        const remainingAmount = Number(debt.totalAmount || 0) - Number(debt.amountPaid || 0);

        const lines = [
          title,
          "",
          `📝 ${debt.title || "Conta a vencer"}`,
          `💰 ${this.formatCurrency(remainingAmount > 0 ? remainingAmount : Number(debt.totalAmount || 0))}`,
          `📅 Vencimento: ${this.formatDate(debt.dueDate || null)}`,
        ];

        if (debt.creditor) {
          lines.push(`🏦 Credor: ${debt.creditor}`);
        }

        if (daysUntilDue > 1) {
          lines.push(`⏳ Faltam ${daysUntilDue} dia(s) para vencer.`);
        }

        await this.sendText(this.socket.user.id, lines.join("\n"));
        this.reminderRegistry.set(triggerKey, new Date().toISOString());
      }
    } catch (error) {
      console.error("Erro ao verificar contas a vencer:", error);
    }
  }

  private formatPaymentLabel(value: string | null): string {
    if (!value) return "Não informado";

    const normalized = String(value).toLowerCase();

    if (normalized === "pix") return "Pix";
    if (normalized === "debito") return "Débito";
    if (normalized === "credito") return "Crédito";
    if (normalized === "dinheiro") return "Dinheiro";
    if (normalized === "boleto") return "Boleto";
    if (normalized === "transferencia") return "Transferência";

    return this.toTitleCase(String(value));
  }

  private mapTypeLabel(type: string | null): string {
    const value = String(type || "").toLowerCase();
    if (value === "expense") return "Despesa";
    if (value === "income") return "Receita";
    if (value === "transfer") return "Transferência";
    return "Não identificado";
  }

  private mapPaymentStatusLabel(type: string | null, paymentMethod: string | null): string {
    const typeValue = String(type || "").toLowerCase();
    const paymentValue = String(paymentMethod || "").toLowerCase();

    if (typeValue === "income") return "Recebido";
    if (paymentValue === "credito") return "Pendente";
    if (typeValue === "transfer") return "Transferido";

    return "Pago";
  }

  private mapCategoryLabel(category: string): string {
    const value = textNormalizerService.normalizeForMatch(category || "");

    if (!value) return "Outros";
    if (value === "alimentacao") return "Alimentação";
    if (value === "saude") return "Saúde";
    if (value === "transporte") return "Transporte";
    if (value === "moradia") return "Moradia";
    if (value === "contas") return "Contas";
    if (value === "receitas") return "Receitas";
    if (value === "receita") return "Receita";
    if (value === "cartao") return "Cartão";
    if (value === "emprestimo") return "Empréstimo";
    if (value === "outros") return "Outros";

    return this.toTitleCase(category);
  }

  private formatCurrency(amount: number | null): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) {
      return "R$ 0,00";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);
  }

  private formatDate(dateValue: string | null): string {
    if (!dateValue) {
      return new Intl.DateTimeFormat("pt-BR").format(new Date());
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("pt-BR").format(new Date());
    }

    return new Intl.DateTimeFormat("pt-BR").format(date);
  }

  private toTitleCase(value: string): string {
    return String(value || "")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private async sendText(jid: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error("Socket do WhatsApp não está conectado.");
    }

    await this.socket.sendMessage(jid, { text });
  }
}

export const whatsappService = new WhatsAppService();