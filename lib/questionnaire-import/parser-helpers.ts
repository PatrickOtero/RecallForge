import { normalizeForComparison } from "@/lib/utils";

export function buildImportId(prefix: string, sourceIndex: number, rawBlock: string) {
  const slug =
    normalizeForComparison(rawBlock)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 42) || `${prefix}-${sourceIndex}`;

  return `${prefix}-${sourceIndex}-${slug}`;
}

export function cleanInlineText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function trimOuterPunctuation(value: string) {
  return cleanInlineText(value).replace(/^[\s,;:.!"'`()[\]{}<>-]+|[\s,;:.!"'`()[\]{}<>-]+$/g, "").trim();
}

export function ensureSentence(value: string) {
  const cleaned = trimOuterPunctuation(value);
  if (!cleaned) {
    return cleaned;
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

export function stripListMarker(value: string) {
  return cleanInlineText(value).replace(/^\s*(?:\d+[\).]|[A-Z][\).]|[-*•])\s*/u, "").trim();
}

export function stripQuestionLabel(value: string) {
  return trimOuterPunctuation(
    cleanInlineText(value).replace(
      /^(?:p|r|q|a|pergunta|resposta|resposta esperada|gabarito|enunciado|quest[aã]o|questao|instru[cç][aã]o|instrucao|frente|verso|termo|defini[cç][aã]o|definicao)\s*(?::|\.|-)\s*/iu,
      "",
    ),
  );
}

export function parseBooleanAnswerToken(value: string): "true" | "false" | null {
  const normalized = normalizeForComparison(value);

  if (/^(v|verdadeiro|c|certo|sim)\b/.test(normalized)) {
    return "true";
  }

  if (/^(f|falso|e|errado|nao)\b/.test(normalized)) {
    return "false";
  }

  return null;
}

export function looksLikeQuestionLine(value: string) {
  const cleaned = cleanInlineText(value);
  const normalized = normalizeForComparison(cleaned);

  return (
    /^\d{1,4}\)\s*(?:\([^)]+\))?\s*\S/u.test(cleaned) ||
    cleaned.endsWith("?") ||
    /^(?:\d+[\).]\s*)?(?:qual|quais|o que|que|como|quando|onde|por que|porque|quem|explique|cite|defina|associe|relacione|complete|marque|assinale|selecione)\b/i.test(
      normalized,
    ) ||
    /^(?:pergunta|q|quest[aã]o|questao)\s*[:.-]/iu.test(cleaned)
  );
}

export function looksLikeOptionLine(value: string) {
  return /^\s*(?:\(?[A-Z]\)|[A-Z][\).]|\((?:x|X| )\))\s+.+/u.test(cleanInlineText(value));
}

export function isBlankLine(value: string) {
  return !cleanInlineText(value);
}

export function normalizeTypeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/^\[|\]$/g, "")
    .trim();
}

export function isTypedHeader(value: string) {
  return /^\[[^\]]+\]$/.test(cleanInlineText(value));
}

export function extractQuestionNumber(value: string) {
  const match = cleanInlineText(value).match(/^(\d+)[\).]/);
  return match?.[1] ?? null;
}

export function normalizeAnswerKeyReference(value: string) {
  return cleanInlineText(value).replace(/^0+/, "");
}

export function uniqueWarnings(warnings: string[]) {
  return [...new Set(warnings.map((warning) => cleanInlineText(warning)).filter(Boolean))];
}

export function buildSectionTitleFallback(value?: string) {
  return trimOuterPunctuation(value ?? "") || "Questões importadas";
}
