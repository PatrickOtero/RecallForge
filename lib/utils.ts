import type {
  DocumentSource,
  QuestionChoice,
  QuestionResponseFormat,
  QuestionType,
  QuizComposition,
  QuizMode,
} from "@/lib/types";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function humanizeDocumentTitle(value: string) {
  const normalized = value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bpara app\b/gi, "")
    .replace(/\bmanual de gestao de estoques\b/i, "Manual de Gestão de Estoques")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!normalized) {
    return "Material de estudo";
  }

  const connectors = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "por"]);

  return normalized
    .split(/\s+/)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index > 0 && connectors.has(lower)) {
        return lower;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function getUnsupportedFileMessage(fileName: string) {
  if (/\.doc$/i.test(fileName)) {
    return "Arquivos .doc antigos ainda não são suportados. Converta para .docx ou .txt.";
  }

  return "Esse formato ainda não é suportado. Use texto colado, .txt, .pdf ou .docx.";
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeQuestionConfig({
  choices,
  responseFormat,
}: {
  choices?: QuestionChoice[];
  responseFormat?: QuestionResponseFormat;
}) {
  if ((!choices || choices.length === 0) && !responseFormat) {
    return null;
  }

  return JSON.stringify({
    choices: choices ?? [],
    responseFormat,
  });
}

export function parseQuestionConfig(
  value: string | null | undefined,
): { choices: QuestionChoice[]; responseFormat?: QuestionResponseFormat } {
  const parsed = safeJsonParse<unknown>(value, null);

  if (Array.isArray(parsed)) {
    return {
      choices: parsed as QuestionChoice[],
      responseFormat: undefined as QuestionResponseFormat | undefined,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      choices: [] as QuestionChoice[],
      responseFormat: undefined as QuestionResponseFormat | undefined,
    };
  }

  const maybeChoices = "choices" in parsed ? (parsed as { choices?: unknown }).choices : [];
  const maybeResponseFormat =
    "responseFormat" in parsed ? (parsed as { responseFormat?: unknown }).responseFormat : undefined;

  const responseFormat: QuestionResponseFormat | undefined =
    maybeResponseFormat === "SHORT" || maybeResponseFormat === "LONG" ? maybeResponseFormat : undefined;

  return {
    choices: Array.isArray(maybeChoices) ? (maybeChoices as QuestionChoice[]) : [],
    responseFormat,
  };
}

export function roundScore(value: number) {
  return Math.round(clamp(value, 0, 1) * 100);
}

export function getQuizModeLabel(mode: QuizMode) {
  switch (mode) {
    case "QUICK_REVIEW":
      return "Revisão rápida";
    case "DEEP_DIVE":
      return "Questionário profundo";
    case "EXAM":
      return "Modo prova";
    case "FEYNMAN":
      return "Modo Feynman";
    case "FLASHCARDS":
      return "Flashcards";
  }
}

export function getQuestionTypeLabel(type: QuestionType) {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return "Múltipla escolha";
    case "TRUE_FALSE":
      return "Verdadeiro ou falso";
    case "FILL_BLANK":
      return "Completar lacuna";
    case "SHORT_ANSWER":
      return "Resposta curta";
    case "FLASHCARD":
      return "Flashcard";
  }
}

export function getQuestionPresentationLabel(type: QuestionType, responseFormat?: QuestionResponseFormat) {
  if (type === "SHORT_ANSWER" && responseFormat === "LONG") {
    return "Resposta discursiva";
  }

  return getQuestionTypeLabel(type);
}

export function getQuizCompositionLabel(composition: QuizComposition) {
  switch (composition) {
    case "AUTO":
      return "Misto automático";
    case "MULTIPLE_CHOICE_ONLY":
      return "Apenas múltipla escolha";
    case "DISCURSIVE_ONLY":
      return "Apenas discursivas";
  }
}

export function getDocumentSourceLabel(source: DocumentSource) {
  switch (source) {
    case "MANUAL_TEXT":
      return "Texto colado";
    case "TXT":
      return "Arquivo TXT";
    case "PDF":
      return "Arquivo PDF";
    case "DOCX":
      return "Arquivo DOCX";
  }
}

export function formatScore(score: number | null) {
  return score === null ? "Sem nota" : `${score}%`;
}

export function formatQuestionCount(total: number) {
  return `${total} ${total === 1 ? "pergunta" : "perguntas"}`;
}

export function formatCharacterCount(total: number) {
  return `${new Intl.NumberFormat("pt-BR").format(total)} caracteres`;
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
