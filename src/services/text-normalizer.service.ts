export interface NormalizedTextResult {
  original: string;
  displayText: string;
  parserText: string;
  matchText: string;
}

class TextNormalizerService {
  public normalizeAll(text: string): NormalizedTextResult {
    const original = String(text || "").trim();
    const displayText = this.normalizeForDisplay(original);
    const parserText = displayText;
    const matchText = this.normalizeForMatch(displayText);

    return {
      original,
      displayText,
      parserText,
      matchText,
    };
  }

  public normalizeForDisplay(text: string): string {
    let value = String(text || "");

    value = this.fixBrokenEncoding(value);
    value = this.fixCommonWords(value);
    value = this.cleanupSpacing(value);
    value = this.cleanupPunctuation(value);

    return value.trim();
  }

  public normalizeForMatch(text: string): string {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private fixBrokenEncoding(text: string): string {
    let value = text;

    const directFixes: Array<[RegExp, string]> = [
      [/farm�cia/gi, "farmácia"],
      [/d�bito/gi, "débito"],
      [/cr�dito/gi, "crédito"],
      [/cart�o/gi, "cartão"],
      [/p�o/gi, "pão"],
      [/dep�sito/gi, "depósito"],
      [/sal�rio/gi, "salário"],
      [/alimenta��o/gi, "alimentação"],
      [/sa�de/gi, "saúde"],
      [/água/gi, "água"],
      [/farmÃ¡cia/gi, "farmácia"],
      [/dÃ©bito/gi, "débito"],
      [/crÃ©dito/gi, "crédito"],
      [/cartÃ£o/gi, "cartão"],
      [/pÃ£o/gi, "pão"],
      [/depÃ³sito/gi, "depósito"],
      [/salÃ¡rio/gi, "salário"],
      [/alimentaÃ§Ã£o/gi, "alimentação"],
      [/saÃºde/gi, "saúde"],
      [/nÃ£o/gi, "não"],
      [/Ã¡/gi, "á"],
      [/Ã©/gi, "é"],
      [/Ã­/gi, "í"],
      [/Ã³/gi, "ó"],
      [/Ãº/gi, "ú"],
      [/Ã£/gi, "ã"],
      [/Ã§/gi, "ç"],
    ];

    for (const [pattern, replacement] of directFixes) {
      value = value.replace(pattern, replacement);
    }

    return value;
  }

  private fixCommonWords(text: string): string {
    let value = text;

    const wordFixes: Array<[RegExp, string]> = [
      [/\bfarmacia\b/gi, "farmácia"],
      [/\bdebito\b/gi, "débito"],
      [/\bcredito\b/gi, "crédito"],
      [/\bcartao\b/gi, "cartão"],
      [/\bpao\b/gi, "pão"],
      [/\bdeposito\b/gi, "depósito"],
      [/\bsalario\b/gi, "salário"],
      [/\balimentacao\b/gi, "alimentação"],
      [/\bsaude\b/gi, "saúde"],
      [/\bonibus\b/gi, "ônibus"],
      [/\bremedio\b/gi, "remédio"],
      [/\bpix\b/gi, "Pix"],
    ];

    for (const [pattern, replacement] of wordFixes) {
      value = value.replace(pattern, replacement);
    }

    return value;
  }

  private cleanupSpacing(text: string): string {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  }

  private cleanupPunctuation(text: string): string {
    return String(text || "")
      .replace(/\s*\.\s*$/, ".")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s*;\s*/g, "; ")
      .replace(/\s*:\s*/g, ": ");
  }
}

export const textNormalizerService = new TextNormalizerService();