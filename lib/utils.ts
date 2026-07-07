import type {
  DocumentSource,
  MatchingPair,
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
  matchingPairs,
  presentationType,
  responseFormat,
}: {
  choices?: QuestionChoice[];
  matchingPairs?: MatchingPair[];
  presentationType?: QuestionType;
  responseFormat?: QuestionResponseFormat;
}) {
  if (
    (!choices || choices.length === 0) &&
    (!matchingPairs || matchingPairs.length === 0) &&
    !presentationType &&
    !responseFormat
  ) {
    return null;
  }

  return JSON.stringify({
    choices: choices ?? [],
    matchingPairs: matchingPairs ?? [],
    presentationType,
    responseFormat,
  });
}

export function parseQuestionConfig(
  value: string | null | undefined,
): {
  choices: QuestionChoice[];
  matchingPairs: MatchingPair[];
  presentationType?: QuestionType;
  responseFormat?: QuestionResponseFormat;
} {
  const parsed = safeJsonParse<unknown>(value, null);

  if (Array.isArray(parsed)) {
    return {
      choices: parsed as QuestionChoice[],
      matchingPairs: [],
      presentationType: undefined,
      responseFormat: undefined,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      choices: [],
      matchingPairs: [],
      presentationType: undefined,
      responseFormat: undefined,
    };
  }

  const maybeChoices = "choices" in parsed ? (parsed as { choices?: unknown }).choices : [];
  const maybeMatchingPairs =
    "matchingPairs" in parsed ? (parsed as { matchingPairs?: unknown }).matchingPairs : [];
  const maybePresentationType =
    "presentationType" in parsed ? (parsed as { presentationType?: unknown }).presentationType : undefined;
  const maybeResponseFormat =
    "responseFormat" in parsed ? (parsed as { responseFormat?: unknown }).responseFormat : undefined;

  const allowedQuestionTypes: QuestionType[] = [
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "FILL_BLANK",
    "SHORT_ANSWER",
    "FLASHCARD",
    "REVEAL_ANSWER",
    "MATCHING",
  ];
  const presentationType: QuestionType | undefined =
    typeof maybePresentationType === "string" && allowedQuestionTypes.includes(maybePresentationType as QuestionType)
      ? (maybePresentationType as QuestionType)
      : undefined;
  const responseFormat: QuestionResponseFormat | undefined =
    maybeResponseFormat === "SHORT" || maybeResponseFormat === "LONG" ? maybeResponseFormat : undefined;

  return {
    choices: Array.isArray(maybeChoices) ? (maybeChoices as QuestionChoice[]) : [],
    matchingPairs: Array.isArray(maybeMatchingPairs) ? (maybeMatchingPairs as MatchingPair[]) : [],
    presentationType,
    responseFormat,
  };
}

export function roundScore(value: number) {
  return Math.round(clamp(value, 0, 1) * 100);
}

export function getQuizModeLabel(mode: QuizMode) {
  switch (mode) {
    case "QUICK_REVIEW":
      return "Revisão geral";
    case "DEEP_DIVE":
      return "Múltipla escolha";
    case "EXAM":
      return "Verdadeiro/Falso";
    case "FEYNMAN":
      return "Revelar resposta";
    case "FLASHCARDS":
      return "Associação";
  }
}

export function getQuestionTypeLabel(type: QuestionType) {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return "Múltipla escolha";
    case "TRUE_FALSE":
      return "Verdadeiro/Falso";
    case "FILL_BLANK":
      return "Completar lacuna";
    case "SHORT_ANSWER":
    case "REVEAL_ANSWER":
      return "Revelar resposta";
    case "FLASHCARD":
      return "Revelar resposta";
    case "MATCHING":
      return "Associação";
  }
}

export function getQuestionPresentationLabel(type: QuestionType, responseFormat?: QuestionResponseFormat) {
  if (type === "SHORT_ANSWER" || type === "REVEAL_ANSWER" || type === "FLASHCARD") {
    return responseFormat === "LONG" ? "Revelar resposta" : "Revelar resposta";
  }

  return getQuestionTypeLabel(type);
}

export function getQuizCompositionLabel(composition: QuizComposition) {
  switch (composition) {
    case "AUTO":
      return "Revisão geral";
    case "MULTIPLE_CHOICE_ONLY":
      return "Múltipla escolha";
    case "DISCURSIVE_ONLY":
      return "Revelar resposta";
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
