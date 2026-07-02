import type {
  Document,
  QuestionChoice,
  QuestionDraft,
  QuestionResponseFormat,
  QuizComposition,
  QuizMode,
  QuizCompositionOption,
  QuizModeOption,
} from "@/lib/types";
import {
  extractSections,
  type TextSection,
} from "@/lib/normalization/text-normalizer";
import {
  buildPromptSignature,
  conceptSimilarity,
  extractReferenceKeywords,
  uniqueConceptTokens,
} from "@/lib/quiz/concept-utils";
import type { GeneratedQuiz, QuizGenerator } from "@/lib/quiz/generator-interface";
import { normalizeForComparison, titleCase } from "@/lib/utils";

type KnowledgeKind =
  | "definition"
  | "purpose"
  | "rule"
  | "procedure"
  | "formula"
  | "comparison"
  | "list";

interface KnowledgeUnit {
  id: string;
  topic: string;
  sourceText: string;
  kind: KnowledgeKind;
  expectedAnswer: string;
  referenceExcerpt: string;
  keywords: string[];
  sectionTitle: string;
  sectionIndex: number;
  importance: number;
  shortAnswerPrompt?: string;
}

interface DocumentAnalysis {
  emphasis: string[];
  sections: TextSection[];
  units: KnowledgeUnit[];
  structuredQuestions: ParsedStructuredQuestion[];
}

interface GeneratedQuestionCandidate {
  question: QuestionDraft;
  unit: KnowledgeUnit;
}

type StructuredPromptStyle = "QUESTION" | "TRUE_FALSE" | "ASSOCIATION" | "FLASHCARD";

type StructuredSectionKind = "DEFAULT" | "ASSOCIATION";

export interface ParsedStructuredQuestion {
  prompt: string;
  expectedAnswer: string;
  referenceExcerpt: string;
  topic: string;
  type: "SHORT_ANSWER";
  sectionTitle: string;
  sectionIndex: number;
  promptStyle: StructuredPromptStyle;
  associationGroup?: string;
  associationItem?: string;
}

interface WorkingStructuredQuestion {
  promptLines: string[];
  answerLines: string[];
  sectionTitle: string;
  sectionIndex: number;
  promptStyle: StructuredPromptStyle;
  explicitPromptPrefix: boolean;
  answerStarted: boolean;
  associationGroup?: string;
}

const targetQuestionCounts: Record<QuizMode, number> = {
  QUICK_REVIEW: 10,
  DEEP_DIVE: 15,
  EXAM: 20,
  FEYNMAN: 8,
  FLASHCARDS: 20,
};

const compositionLabels: Record<QuizComposition, string> = {
  AUTO: "Misto automatico",
  MULTIPLE_CHOICE_ONLY: "Apenas multipla escolha",
  DISCURSIVE_ONLY: "Apenas discursivas",
};

export const MINIMUM_STRUCTURED_QUESTION_PAIRS = 3;

const rawTopicWhitelist = new Set(
  [
    "gestao de estoques",
    "cadeia de abastecimento",
    "sistematicas de abastecimento",
    "sistematica 1",
    "sistematica 10",
    "sistematica 11",
    "sistematica 20",
    "saida media",
    "cobertura de estoque",
    "alocacao de gondola",
    "estoque padrao",
    "estoque padrao tradicional",
    "estoque padrao final",
    "volume de oferta",
    "percentual de reposicao",
    "faixas de reposicao",
    "sugestao de pedido automatico",
    "pedido extra",
    "dias de estoque",
    "recebimento",
    "recebimento junto a fornecedores externos",
    "recebimento junto a carga do cd",
    "armazenamento",
    "movimentacoes internas",
    "inventario",
    "inventarios",
    "perdas",
    "perda",
    "perdas identificadas",
    "perdas nao identificadas",
    "perda bruta",
    "perda liquida",
    "ruptura",
    "relatorio dia a dia",
    "relatorio de produtos nao atendidos",
    "relatorio de acompanhamento falta x excesso",
    "gestao de estoque cobertura",
    "posicao de estoque",
    "alteracao de pedidos paes industrializados",
    "alteracao de pedido sistematica 1",
    "etiqueta de separacao",
    "ajuste de estoque",
    "acompanhamento de perdas",
    "curva abc",
  ].map((topic) => normalizeForComparison(topic)),
);

const completeSentenceEndingMatcher = /[.!?]$/;
const truncatedHeadlineMatcher = /^\S+\s+(todo|todos|toda|todas)\b/i;
const blockedStartMatcher =
  /^(a|ao|aos|as|com|da|das|de|do|dos|e|em|na|nas|no|nos|para|por|sem)\b/i;
const looseVerbStartMatcher =
  /^(verificar|analisar|disponibilizar|acompanhar|controlar|consultar|medir|registrar|alterar|efetuar|informar|exportar)\b/i;
const systemNoiseMatcher =
  /(^acesso:|>>|breadcrumb|menu|caminho do sistema|campo de alteracao|exportar rms|zsintranet|rms\b)/i;
const brokenSymbolMatcher = /[âˆƒâ‰¡ï¿¾]/;
const separatorLineMatcher = /^[-_=]{6,}$/;
const structuredSectionMatcher =
  /^(?:\[\s*(.+?)\s*\]|(?:bloco|modulo|m[oó]dulo|tema|cap[ií]tulo|sec[aã]o|se[cç][aã]o)\s*\d*\s*[-–—:]?\s+(.+))$/i;
const structuredAnswerMatcher = /^(?:resposta|resposta esperada|gabarito|a|r)\s*[:\-–—]?\s*(.*)$/i;
const structuredQuestionLeadMatcher =
  /^(?:\d+[\).]\s*)?(?:(?:pergunta|q|p)\s*[:\-–—]\s*|qual|quais|o que|que|como|quando|onde|por que|porque|quem|explique|cite|defina|associe|relacione|complete|verdadeiro ou falso|flashcards?)\b/i;
const structuredAssociationInstructionMatcher =
  /^(?:quest[oõ]es? de associa[cç][aã]o|associe(?: cada item)?(?: [aà] resposta correta)?|associa[cç][aã]o)\b/i;
const metaInstructionMatcher =
  /^(?:use da seguinte forma|instru[cç][oõ]es? de uso|como usar|tente responder sem olhar|confira o gabarito|refa[cç]a as perguntas erradas|reveja as perguntas erradas)\b/i;
const blockedGeneratedPromptMatcher =
  /^(?:resuma em uma frase o conceito de (?:qual|quais)\b|explique (?:qual|quais)\b|use da seguinte forma\b)/i;
const invalidTopicStartMatcher =
  /^(?:o ajuste deve|sabemos tamb[eé]m|todos os|toda a|use|excel|top|campo de altera[cç][aã]o|ap[oó]s t[eé]rmino)/i;
const invalidTopicContentMatcher =
  /(?:c[oó]pia autorizada|excel top 30|campo de altera[cç][aã]o|acesso:|>>|tela de acesso|tela de altera[cç][aã]o)/i;
const formulaOnlyTopicMatcher = /^[\p{L}\d\s]+(?:[+*/-][\p{L}\d\s]+)+$/u;
const noisyAnswerMatcher =
  /(?:c[oó]pia autorizada|acesso:|>>|campo de altera[cç][aã]o|excel top 30|tela de acesso|tela de altera[cç][aã]o)/i;
const numberedFormulaMatcher = /^(.{3,90}?)\s*[:=-]\s*(.{8,260})$/i;
const definitionMatchers = [
  /^([^,;:.!?]{3,90}?)\s+(?:e|\u00e9|eh)\s+((?:a|o|os|as|um|uma)\b.{8,260})$/i,
  /^([^,;:.!?]{3,90}?)\s+(?:sao|s\u00e3o|significa|corresponde a|refere-se a|refere se a|consiste em)\s+(.{12,260})$/i,
];
const purposeMatchers = [
  /^(.{3,120}?)\s+(?:serve para|permite|visa|ajuda a)\s+(.{12,260})$/i,
];
const comparisonMatchers = [
  /^a diferen(?:ca|\u00e7a) entre\s+(.{3,60}?)\s+e\s+(.{3,60}?)\s+(.{12,260})$/i,
  /^(.{3,60}?)\s+e\s+(.{3,60}?)\s+se diferen(?:ciam|\u00e7iam)\s+(.{12,260})$/i,
];

function trimOuterPunctuation(value: string) {
  return value
    .replace(/^[\s,;:.!"'`()[\]{}<>-]+|[\s,;:.!"'`()[\]{}<>-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSentence(value: string) {
  const cleaned = trimOuterPunctuation(value);
  if (!cleaned) {
    return cleaned;
  }

  return completeSentenceEndingMatcher.test(cleaned) ? cleaned : `${cleaned}.`;
}

function sanitizeGeneratedText(text: string) {
  return text
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00ce\u039e|\u00ef\u00bf\u00be|â–ª|ïƒ˜/g, " ")
    .replace(/\bN\s+O(?=\s+\p{L}{3,})/gu, "N\u00c3O")
    .replace(/\bpar metros\b/gi, "par\u00e2metros")
    .replace(/\bsistematica\b/gi, "sistem\u00e1tica")
    .replace(/\s*={3,}\s*/g, " ")
    .replace(/\s*[-–—]{3,}\s*/g, " ")
    .replace(/\bcomo por exemplo:\s*/gi, "como ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function containsBrokenGeneratedText(text: string) {
  const normalized = normalizeForComparison(text);

  return (
    /Îž|ï¿¾|Ãƒ|Ã‚|ï¿½|====/i.test(text) ||
    /\bN O\b/.test(text) ||
    /\bpar metros\b/i.test(text) ||
    /C[oó]pia autorizada|KEVIN SILVA|N[aã]o pode ser distribu[ií]do|Acesso:|>>|Campo de altera[cç][aã]o|Ap[oó]s t[eé]rmino, exportar RMS/i.test(
      text,
    ) ||
    normalized.includes("copia autorizada") ||
    normalized.includes("kevin silva") ||
    normalized.includes("nao pode ser distribuido") ||
    normalized.includes("campo de alteracao")
  );
}

function sanitizeGeneratedTextStrict(text: string) {
  return sanitizeGeneratedText(text)
    .replace(/\r/g, "\n")
    .replace(/\u00ce\u017e|\u00ce\u039e|\u00ef\u00bf\u00be|\u00ef\u0083\u0098|\u00e2\u0096\u00aa|â‰¡/g, " ")
    .replace(/\b(?:copia autorizada|c[oó]pia autorizada)\b[^\n]*/gi, " ")
    .replace(/\bKEVIN SILVA\b/gi, " ")
    .replace(/\bN[aã]o pode ser distribu[ií]do\b[^\n]*/gi, " ")
    .replace(/\bAcesso:\b[^\n]*/gi, " ")
    .replace(/\bCampo de altera[cç][aã]o\b[^\n]*/gi, " ")
    .replace(/\bAp[oó]s t[eé]rmino,\s*exportar RMS\b[^\n]*/gi, " ")
    .replace(/\bExcel Top 30\b[^\n]*/gi, " ")
    .replace(/\bN\s+O(?=\s+\p{L}{3,})/gu, "NAO")
    .replace(/\bpar metros\b/gi, "parametros")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedRawArtifact(text: string) {
  const normalized = normalizeForComparison(text);

  return (
    /Îž|â‰¡|ï¿¾|Ãƒ|Ã‚|ï¿½|====/i.test(text) ||
    /\bN O\b/.test(text) ||
    /\bpar metros\b/i.test(text) ||
    /C[oó]pia autorizada|KEVIN SILVA|N[aã]o pode ser distribu[ií]do|Acesso:|>>|Campo de altera[cç][aã]o|Ap[oó]s t[eé]rmino, exportar RMS|Excel Top 30/i.test(
      text,
    ) ||
    normalized.includes("copia autorizada") ||
    normalized.includes("kevin silva") ||
    normalized.includes("nao pode ser distribuido") ||
    normalized.includes("campo de alteracao") ||
    normalized.includes("excel top 30") ||
    normalized.includes("oferta todos os produtos da carga seca")
  );
}

function sanitizePromptText(value: string) {
  return sanitizeGeneratedTextStrict(value)
    .replace(/\s+\?/g, "?")
    .replace(/\s+:/g, ":")
    .trim();
}

function sanitizeTopicText(value: string) {
  return titleCase(trimOuterPunctuation(sanitizeGeneratedTextStrict(value)));
}

function sanitizeAnswerText(value: string) {
  return ensureSentence(sanitizeGeneratedTextStrict(value));
}

function sanitizeQuestionDraft(question: QuestionDraft): QuestionDraft {
  const sanitizedChoices = question.choices?.map((choice) => ({
    ...choice,
    label: sanitizeAnswerText(choice.label),
  }));

  return {
    ...question,
    prompt: sanitizePromptText(question.prompt),
    topic: sanitizeTopicText(question.topic),
    correctAnswer: question.correctAnswer ? sanitizeAnswerText(question.correctAnswer) : question.correctAnswer,
    referenceAnswer: question.referenceAnswer ? sanitizeAnswerText(question.referenceAnswer) : question.referenceAnswer,
    rubric: question.rubric ? sanitizeAnswerText(question.rubric) : question.rubric,
    explanation: question.explanation ? sanitizeAnswerText(question.explanation) : question.explanation,
    choices: sanitizedChoices,
  } satisfies QuestionDraft;
}

function isRawMetadataText(value: string) {
  const cleaned = trimOuterPunctuation(sanitizeGeneratedTextStrict(value));
  const normalized = normalizeForComparison(cleaned);

  return (
    !cleaned ||
    containsBlockedRawArtifact(cleaned) ||
    looksLikeSystemNoise(cleaned) ||
    /^manual de /i.test(normalized) ||
    /^sumario$/i.test(normalized) ||
    /^indice( pagina)?$/i.test(normalized) ||
    /^resumo geral$/i.test(normalized) ||
    /^exemplo pratico$/i.test(normalized) ||
    /^rio de janeiro(?:,?\s+dezembro de \d{4})?$/i.test(normalized) ||
    /^\p{L}+\s+de\s+\d{4}$/iu.test(cleaned) ||
    /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}\b/i.test(
      normalized,
    ) ||
    /^[A-Z][a-z]+ de [A-Z][a-z]+(?:, \d{4})?$/.test(cleaned) ||
    /^\d{1,3}$/.test(cleaned)
  );
}

function isBlockedRawLabel(value: string) {
  const normalized = normalizeForComparison(value);
  return /^(exemplo pratico|resumo geral|tela de acesso|tela de alteracao|campo de alteracao)$/i.test(normalized);
}

function classifyKnowledgeUnit(sourceText: string): KnowledgeKind | null {
  const cleaned = ensureSentence(sanitizeAnswerText(sourceText));
  const normalized = normalizeForComparison(cleaned);

  if (!cleaned || isRawMetadataText(cleaned)) {
    return null;
  }

  if (/\b(diferenca entre|diferenciam)\b/i.test(normalized)) {
    return "comparison";
  }

  if (/=/.test(cleaned)) {
    return "formula";
  }

  if (/\be uma ferramenta\b/i.test(normalized) && /\bpermite\b/i.test(normalized)) {
    return "purpose";
  }

  if (definitionMatchers.some((matcher) => matcher.test(cleaned)) || /^(define-se como|definese como|chamamos de)\b/i.test(normalized)) {
    return "definition";
  }

  if (/\b(serve para|permite|auxilia|ajuda a|visa)\b/i.test(normalized)) {
    return "purpose";
  }

  if (
    /\b(nunca devemos|nao deve|não deve|deve|devem)\b/i.test(normalized) ||
    /^(apos|quanto a|na sistematica|no recebimento|o aep deve)\b/i.test(normalized)
  ) {
    return "procedure";
  }

  if (
    /\b(temos \w+ tipos|os motivos mais comuns sao|as etapas sao|dentre eles estao|sao:)\b/i.test(normalized) &&
    /[,;:]|\be\b/i.test(normalized)
  ) {
    return "list";
  }

  return null;
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

// Raw-text helpers are intentionally kept isolated while raw generation stays disabled.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function splitIntoSentences(value: string) {
  return value
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function looksLikeSystemNoise(value: string) {
  const cleaned = trimOuterPunctuation(value);
  const normalized = normalizeForComparison(cleaned);

  return (
    !cleaned ||
    systemNoiseMatcher.test(cleaned) ||
    normalized.includes(" acesso ") ||
    normalized.startsWith("acesso ") ||
    normalized.includes(">>") ||
    /^[A-Z0-9/_ -]{2,}$/.test(cleaned)
  );
}

function hasBrokenExtractionSymbols(value: string) {
  return brokenSymbolMatcher.test(value);
}

function startsLikeBadFragment(value: string) {
  const cleaned = trimOuterPunctuation(value);
  return blockedStartMatcher.test(cleaned) || looseVerbStartMatcher.test(cleaned);
}

function hasKnowledgeVerb(value: string) {
  return (
    /\b\p{L}+\s+\u00e9\s+/u.test(value) ||
    /\b\p{L}+\s+e\s+/u.test(value) ||
    /\b(eh|sao|significa|corresponde|consiste|refere|serve|permite|visa|ajuda|mede|mostra|indica|representa|gera|resulta|afeta|calcula|deve|devem|consegue)\b/i.test(
      normalizeForComparison(value),
    ) ||
    value.includes("=")
  );
}

function isCompleteKnowledgeText(value: string, allowVerbLead = false) {
  const cleaned = ensureSentence(value);

  if (
    cleaned.length < 24 ||
    countWords(cleaned) < 6 ||
    looksLikeSystemNoise(cleaned) ||
    hasBrokenExtractionSymbols(cleaned)
  ) {
    return false;
  }

  if (!allowVerbLead && startsLikeBadFragment(cleaned)) {
    return false;
  }

  if (!completeSentenceEndingMatcher.test(cleaned)) {
    return false;
  }

  if (!allowVerbLead && !hasKnowledgeVerb(cleaned)) {
    return false;
  }

  return uniqueConceptTokens(cleaned).length >= 3;
}

function isDidacticAnswerText(value: string, allowVerbLead = false) {
  const cleaned = ensureSentence(value);

  return (
    isCompleteKnowledgeText(cleaned, allowVerbLead) &&
    cleaned.length <= 320 &&
    !noisyAnswerMatcher.test(cleaned)
  );
}

function isUsefulTopic(value: string) {
  const topic = trimOuterPunctuation(value);
  const normalized = normalizeForComparison(topic);
  const words = topic.split(/\s+/).filter(Boolean);

  if (
    topic.length < 3 ||
    topic.length > 90 ||
    words.length > 12 ||
    looksLikeSystemNoise(topic) ||
    hasBrokenExtractionSymbols(topic)
  ) {
    return false;
  }

  if (startsLikeBadFragment(topic) || /[:;,.!?]$/.test(topic)) {
    return false;
  }

  if (/^(isso|isto|essa|esse|esta|este|abaixo|acima|mesmo|mesma)\b/i.test(topic)) {
    return false;
  }

  if (/^(qual|quais|que|o que|como|quando|onde|por que|porque|quem)\b/i.test(topic)) {
    return false;
  }

  if (
    invalidTopicStartMatcher.test(topic) ||
    invalidTopicContentMatcher.test(topic) ||
    topic.startsWith("-") ||
    formulaOnlyTopicMatcher.test(topic)
  ) {
    return false;
  }

  if (truncatedHeadlineMatcher.test(topic)) {
    return false;
  }

  if (/^[A-Z]{2,5}$/.test(topic)) {
    return false;
  }

  if (/^(introducao|visao geral|resumo geral)$/i.test(normalized)) {
    return false;
  }

  if (words.length >= 5 && /\b(e|eh|sao|deve|devem|permite|visa|ajuda|sabemos|pode|mostra)\b/i.test(normalized)) {
    return false;
  }

  if (words.length >= 4 && /\b(organiza|gera|grava|cobre|corresponde|significa|permite|indica|resulta)\b/i.test(normalized)) {
    return false;
  }

  return normalized.length >= 3;
}

function isBlockedRawTopicStart(normalized: string) {
  return (
    /^(o|a|os|as)\b/.test(normalized) ||
    /^(quanto a|para|com|em|de|da|do|dos|das)\b/.test(normalized) ||
    /^(sabemos tambem|agora|portanto|todos os|toda a)\b/.test(normalized)
  );
}

function hasConjugatedVerb(normalized: string) {
  return /\b(e|eh|sao|deve|devem|permite|auxilia|ajuda|visa|podem|pode|garante|garantir|gera|resulta|mostra|indica|organiza)\b/.test(
    normalized,
  );
}

function isWhitelistedRawTopic(normalized: string) {
  return rawTopicWhitelist.has(normalized) || /^sistematica \d+$/.test(normalized);
}

function buildSectionContextTopic(section: TextSection) {
  const cleanedTitle = sanitizeTopicText(cleanSectionTitle(section.title));
  const normalizedTitle = normalizeForComparison(cleanedTitle);

  if (isWhitelistedRawTopic(normalizedTitle)) {
    return cleanedTitle;
  }

  const normalizedWithoutPrefix = normalizeForComparison(
    cleanedTitle.replace(/^(racional da|racional do|conceitos basicos de|relatorios de gestao dos estoques)\s+/i, ""),
  );

  if (isWhitelistedRawTopic(normalizedWithoutPrefix)) {
    return titleCase(cleanedTitle.replace(/^(racional da|racional do|conceitos basicos de|relatorios de gestao dos estoques)\s+/i, ""));
  }

  return null;
}

function cleanSectionTitle(title: string) {
  return trimOuterPunctuation(title.replace(/^\d+(\.\d+)*\s*[-–—.:]?\s*/, ""));
}

function getPreferredTopicFromSection(section: TextSection) {
  const cleanedTitle = titleCase(cleanSectionTitle(section.title));
  return isUsefulTopic(cleanedTitle) ? cleanedTitle : null;
}

function sanitizeStructuredLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isSeparatorLine(value: string) {
  return separatorLineMatcher.test(value);
}

function isMetaInstructionLine(value: string) {
  return metaInstructionMatcher.test(normalizeForComparison(value));
}

function hasExplicitStructuredPromptPrefix(value: string) {
  return /^(?:pergunta|q|p)\s*[:\-–—]\s*/i.test(value);
}

function stripStructuredQuestionPrefix(value: string) {
  return value.replace(/^(?:\d+[\).]\s*|(?:pergunta|q|p)\s*[:\-–—]\s*)/i, "").trim();
}

function detectStructuredPromptStyle(value: string): StructuredPromptStyle {
  const normalized = normalizeForComparison(value);

  if (normalized.startsWith("verdadeiro ou falso")) {
    return "TRUE_FALSE";
  }

  if (normalized.startsWith("associe") || normalized.startsWith("relacione")) {
    return "ASSOCIATION";
  }

  if (normalized.startsWith("flashcard")) {
    return "FLASHCARD";
  }

  return "QUESTION";
}

function isStructuredSectionTitle(value: string) {
  return structuredSectionMatcher.test(value);
}

function isAssociationInstructionLine(value: string) {
  return structuredAssociationInstructionMatcher.test(normalizeForComparison(value));
}

function getStructuredSectionKind(value: string): StructuredSectionKind {
  return isAssociationInstructionLine(value) ? "ASSOCIATION" : "DEFAULT";
}

function normalizeStructuredSectionTitle(value: string) {
  const matched = value.match(structuredSectionMatcher);
  const raw = trimOuterPunctuation(matched?.[1] ?? matched?.[2] ?? value).replace(/^\[\s*|\s*\]$/g, "");
  if (!raw) {
    return "Questionario importado";
  }

  return titleCase(raw);
}

function parseStructuredAnswerLine(value: string) {
  const matched = value.match(structuredAnswerMatcher);
  if (!matched) {
    return null;
  }

  return trimOuterPunctuation(matched[1] ?? "");
}

function isStructuredPromptLine(value: string) {
  if (!value || isSeparatorLine(value) || isMetaInstructionLine(value)) {
    return false;
  }

  if (hasExplicitStructuredPromptPrefix(value)) {
    return true;
  }

  const prompt = stripStructuredQuestionPrefix(value);
  return prompt.endsWith("?") || structuredQuestionLeadMatcher.test(prompt);
}

function looksLikeStructuredPromptContinuation(value: string) {
  if (!value || isSeparatorLine(value) || isMetaInstructionLine(value)) {
    return false;
  }

  if (isStructuredPromptLine(value) || isStructuredSectionTitle(value) || parseStructuredAnswerLine(value) !== null) {
    return false;
  }

  return value.length >= 12;
}

function isStructuredAssociationItemLine(value: string) {
  if (!value || isSeparatorLine(value) || isMetaInstructionLine(value)) {
    return false;
  }

  return /^\d+[\).]\s+\S+/.test(value);
}

function stripListMarker(value: string) {
  return value.replace(/^[-*•]\s*/, "").trim();
}

function joinStructuredAnswerLines(lines: string[]) {
  const cleaned = lines.map((line) => stripListMarker(trimOuterPunctuation(line))).filter(Boolean);
  if (cleaned.length === 0) {
    return "";
  }

  if (cleaned.length === 1) {
    return ensureSentence(cleaned[0]);
  }

  return ensureSentence(cleaned.join("; "));
}

function inferStructuredTopic(prompt: string, answer: string, sectionTitle: string) {
  if (sectionTitle && sectionTitle !== "Questionario importado" && isUsefulTopic(sectionTitle)) {
    return sectionTitle;
  }

  const keywords = extractReferenceKeywords(`${prompt} ${answer}`, 4).filter(
    (keyword) => !/^(qual|quais|que|como|onde|quando|porque|por)$/.test(keyword),
  );

  if (keywords.length === 0) {
    return "Questoes importadas";
  }

  return titleCase(keywords.slice(0, 2).join(" "));
}

function finalizeStructuredQuestion(current: WorkingStructuredQuestion | null) {
  if (!current || current.answerLines.length === 0) {
    return null;
  }

  const prompt = trimOuterPunctuation(current.promptLines.join(" "));
  const expectedAnswer = joinStructuredAnswerLines(current.answerLines);
  const isAssociation = current.promptStyle === "ASSOCIATION";
  if (
    !prompt ||
    !expectedAnswer ||
    (!prompt.endsWith("?") && current.promptStyle === "QUESTION" && !current.explicitPromptPrefix)
  ) {
    return null;
  }

  return {
    prompt,
    expectedAnswer,
    referenceExcerpt: isAssociation ? `${prompt} - ${expectedAnswer}` : `${prompt}\nResposta:\n${expectedAnswer}`,
    topic: isAssociation ? current.sectionTitle : inferStructuredTopic(prompt, expectedAnswer, current.sectionTitle),
    type: "SHORT_ANSWER",
    sectionTitle: current.sectionTitle,
    sectionIndex: current.sectionIndex,
    promptStyle: current.promptStyle,
    associationGroup: current.associationGroup,
    associationItem: isAssociation ? prompt : undefined,
  } satisfies ParsedStructuredQuestion;
}

function dedupeStructuredQuestions(questions: ParsedStructuredQuestion[]) {
  const seen = new Set<string>();
  const deduped: ParsedStructuredQuestion[] = [];

  for (const question of questions) {
    const key = `${buildPromptSignature(question.prompt)}|${buildPromptSignature(question.expectedAnswer)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(question);
  }

  return deduped;
}

export function parseStructuredQuestionnaire(text: string): ParsedStructuredQuestion[] {
  const rawLines = text.split(/\r?\n/).map(sanitizeStructuredLine);
  const questions: ParsedStructuredQuestion[] = [];
  let sectionTitle = "Questionario importado";
  let sectionIndex = 0;
  let sectionKind: StructuredSectionKind = "DEFAULT";
  let current: WorkingStructuredQuestion | null = null;

  function pushCurrent() {
    const parsed = finalizeStructuredQuestion(current);
    if (parsed) {
      questions.push(parsed);
    }

    current = null;
  }

  for (const rawLine of rawLines) {
    const line = sanitizeStructuredLine(rawLine);
    if (!line || isSeparatorLine(line)) {
      continue;
    }

    if (isStructuredSectionTitle(line)) {
      pushCurrent();
      sectionTitle = normalizeStructuredSectionTitle(line);
      sectionIndex += 1;
      sectionKind = getStructuredSectionKind(line) === "ASSOCIATION" ? "ASSOCIATION" : "DEFAULT";
      continue;
    }

    if (isAssociationInstructionLine(line)) {
      pushCurrent();
      sectionKind = "ASSOCIATION";
      if (normalizeForComparison(sectionTitle) === normalizeForComparison("Questionario importado")) {
        sectionTitle = "Questoes de associacao";
      }
      continue;
    }

    const inlineAnswer = parseStructuredAnswerLine(line);
    if (inlineAnswer !== null) {
      if (!current) {
        continue;
      }

      current.answerStarted = true;
      if (inlineAnswer) {
        current.answerLines.push(inlineAnswer);
      }
      continue;
    }

    if (isMetaInstructionLine(line) && !current?.answerStarted) {
      continue;
    }

    if (sectionKind === "ASSOCIATION" && isStructuredAssociationItemLine(line)) {
      pushCurrent();
      current = {
        promptLines: [stripStructuredQuestionPrefix(line)],
        answerLines: [],
        sectionTitle,
        sectionIndex,
        promptStyle: "ASSOCIATION",
        explicitPromptPrefix: false,
        answerStarted: false,
        associationGroup: `${sectionIndex}:${normalizeForComparison(sectionTitle)}`,
      };
      continue;
    }

    if (isStructuredPromptLine(line)) {
      pushCurrent();
      current = {
        promptLines: [stripStructuredQuestionPrefix(line)],
        answerLines: [],
        sectionTitle,
        sectionIndex,
        promptStyle: sectionKind === "ASSOCIATION" ? "ASSOCIATION" : detectStructuredPromptStyle(line),
        explicitPromptPrefix: hasExplicitStructuredPromptPrefix(line),
        answerStarted: false,
        associationGroup: sectionKind === "ASSOCIATION" ? `${sectionIndex}:${normalizeForComparison(sectionTitle)}` : undefined,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (!current.answerStarted && looksLikeStructuredPromptContinuation(line)) {
      current.promptLines.push(line);
      continue;
    }

    if (current.answerStarted) {
      current.answerLines.push(line);
    }
  }

  pushCurrent();
  return dedupeStructuredQuestions(questions);
}

export function detectStructuredQuestionnaire(text: string) {
  return parseStructuredQuestionnaire(text).length >= MINIMUM_STRUCTURED_QUESTION_PAIRS;
}

function buildTopicFallback(section: TextSection, content: string) {
  const preferredTitle = getPreferredTopicFromSection(section);
  if (preferredTitle && preferredTitle !== "Visao geral") {
    return preferredTitle;
  }

  const keywords = extractReferenceKeywords(content, 3);
  if (keywords.length === 0) {
    return "Ideia central";
  }

  return titleCase(keywords.join(" "));
}

function buildImportance(kind: KnowledgeKind, topic: string, expectedAnswer: string, sectionTitle: string) {
  let score =
    kind === "definition"
      ? 9
      : kind === "purpose"
        ? 8
        : kind === "formula"
          ? 8
          : kind === "comparison"
            ? 7
            : kind === "rule"
              ? 7
              : kind === "procedure"
                ? 6
                : 6;

  const normalizedTopic = normalizeForComparison(topic);
  const normalizedSection = normalizeForComparison(sectionTitle);

  if (normalizedSection.includes(normalizedTopic)) {
    score += 2;
  }

  if (expectedAnswer.includes("=") || /\bindice|calculo|formula\b/i.test(expectedAnswer)) {
    score += 1;
  }

  score += Math.min(4, uniqueConceptTokens(expectedAnswer).length);
  return score;
}

function createKnowledgeUnit(
  kind: KnowledgeKind,
  topicInput: string,
  expectedAnswerInput: string,
  sourceTextInput: string,
  section: TextSection,
  referenceExcerptInput?: string,
): KnowledgeUnit | null {
  const topic = sanitizeTopicText(topicInput);
  const expectedAnswer = sanitizeAnswerText(expectedAnswerInput);
  const sourceText = sanitizeAnswerText(sourceTextInput);
  const referenceExcerpt = sanitizeAnswerText(referenceExcerptInput ?? sourceTextInput);

  if (
    isRawMetadataText(topic) ||
    isRawMetadataText(expectedAnswer) ||
    isRawMetadataText(sourceText) ||
    isRawMetadataText(referenceExcerpt) ||
    !isUsefulTopic(topic) ||
    containsBrokenGeneratedText(topic) ||
    containsBlockedRawArtifact(topic) ||
    containsBrokenGeneratedText(expectedAnswer) ||
    containsBlockedRawArtifact(expectedAnswer) ||
    containsBrokenGeneratedText(sourceText) ||
    containsBlockedRawArtifact(sourceText) ||
    containsBrokenGeneratedText(referenceExcerpt) ||
    containsBlockedRawArtifact(referenceExcerpt) ||
    !isDidacticAnswerText(expectedAnswer, kind === "procedure" || kind === "list") ||
    !isDidacticAnswerText(sourceText, kind === "procedure" || kind === "list") ||
    !isDidacticAnswerText(referenceExcerpt, kind === "procedure" || kind === "list")
  ) {
    return null;
  }

  const keywords = extractReferenceKeywords(`${topic} ${expectedAnswer} ${referenceExcerpt}`, 6);
  if (keywords.length < 2) {
    return null;
  }

  return {
    id: `${kind}-${normalizeForComparison(topic)}-${normalizeForComparison(expectedAnswer).slice(0, 72)}`,
    topic,
    sourceText,
    kind,
    expectedAnswer,
    referenceExcerpt,
    keywords,
    sectionTitle: section.title,
    sectionIndex: section.index,
    importance: buildImportance(kind, topic, expectedAnswer, section.title),
  } satisfies KnowledgeUnit;
}

function buildStructuredUnit(subject: string, predicate: string, sourceText: string, section: TextSection) {
  const normalizedPredicate = normalizeForComparison(predicate);

  if (/^(e|eh|sao|significa|corresponde a|refere se a|consiste em)\b/i.test(normalizedPredicate)) {
    return createKnowledgeUnit(
      "definition",
      subject,
      `${trimOuterPunctuation(subject)} ${trimOuterPunctuation(predicate)}`,
      sourceText,
      section,
    );
  }

  if (/^(serve para|permite|visa|ajuda a)\b/i.test(normalizedPredicate)) {
    return createKnowledgeUnit(
      "purpose",
      subject,
      `${trimOuterPunctuation(subject)} ${trimOuterPunctuation(predicate)}`,
      sourceText,
      section,
    );
  }

  if (/=|\bformula|calculo|indice\b/i.test(predicate)) {
    return createKnowledgeUnit(
      "formula",
      subject,
      `${trimOuterPunctuation(subject)} ${trimOuterPunctuation(predicate)}`,
      sourceText,
      section,
    );
  }

  if (/\bdeve|devem|nunca|sempre|obrigatorio\b/i.test(predicate)) {
    return createKnowledgeUnit(
      "rule",
      subject,
      `${trimOuterPunctuation(subject)} ${trimOuterPunctuation(predicate)}`,
      sourceText,
      section,
    );
  }

  return null;
}

function buildKnownProcedurePrompt(sentence: string, section: TextSection) {
  const sectionTopic = buildSectionContextTopic(section);
  const normalized = normalizeForComparison(sentence);

  const afterValidationMatch = sentence.match(/^Apos\s+(.{12,120}?),\s+(.{20,220})$/i);
  if (afterValidationMatch && sectionTopic && /inventari/i.test(normalizeForComparison(sectionTopic))) {
    return "O que deve acontecer apos a validacao das informacoes de estoque em um inventario?";
  }

  const systematicMatch = sentence.match(/^(?:Na|No|Em)\s+(Sistematica\s+\d+),\s+(.{20,260})$/i);
  if (systematicMatch) {
    const topic = sanitizeTopicText(systematicMatch[1]);
    if (isValidRawTopic(topic)) {
      return `Como funciona a ${topic}?`;
    }
  }

  const quantityChangeMatch = sentence.match(/^Quanto a\s+carga seca(?:\s+e\s+congelada)?,\s+as lojas podem efetuar alteracao nas quantidades sugeridas(?:\s+ate\s+as\s+([0-9]{1,2}h))?/i);
  if (quantityChangeMatch) {
    return "Em qual horario as lojas podem alterar as quantidades sugeridas para carga seca e congelada?";
  }

  const actorMatch = sentence.match(/^(?:o|a|os|as)\s+([A-Z]{2,6}|[\p{L}]{3,40})\s+deve\b/iu);
  const actor = actorMatch?.[1]?.toUpperCase();

  if (actor && sectionTopic && isValidRawTopic(sectionTopic)) {
    if (/^recebimento\b/i.test(normalizeForComparison(sectionTopic))) {
      return `O que o ${actor} deve fazer no ${sectionTopic.toLowerCase()}?`;
    }

    return `O que o ${actor} deve fazer em ${sectionTopic.toLowerCase()}?`;
  }

  const neverAcceptMatch = sentence.match(/nunca (?:devemos|deve)\s+(.{8,120})/i);
  if (neverAcceptMatch) {
    return "Que tipo de pedido nunca deve ser aceito?";
  }

  if (/\bdeverao ser assinadas\b/i.test(normalized) && sectionTopic && /inventari/i.test(normalizeForComparison(sectionTopic))) {
    return "O que deve acontecer apos a validacao das informacoes de estoque em um inventario?";
  }

  return null;
}

function buildKnownListPrompt(sentence: string) {
  const normalized = normalizeForComparison(sentence);
  const explicitListMatch =
    sentence.match(/temos\s+(.{1,20}?)\s+tipos?\s+de\s+(.{3,80}?)(?:[.:]|$)/i) ??
    sentence.match(/quatro\s+tipos?\s+de\s+(.{3,80}?)(?:[.:]|$)/i);

  if (explicitListMatch) {
    const quantity = trimOuterPunctuation(explicitListMatch[1] ?? "quatro");
    const subject = trimOuterPunctuation(explicitListMatch[2] ?? explicitListMatch[1] ?? "");
    if (subject) {
      return {
        topic: titleCase(subject),
        prompt: `Quais sao os ${quantity.toLowerCase()} tipos de ${subject.toLowerCase()}?`,
      };
    }
  }

  if (/os motivos mais comuns sao/i.test(normalized)) {
    return {
      topic: "Motivos mais comuns",
      prompt: "Quais sao os motivos mais comuns?",
    };
  }

  if (/as etapas sao/i.test(normalized)) {
    return {
      topic: "Etapas do processo",
      prompt: "Quais sao as etapas do processo?",
    };
  }

  return null;
}

function extractSafeDefinitionUnit(sentence: string, section: TextSection) {
  const cleaned = ensureSentence(sentence);
  const normalized = normalizeForComparison(cleaned);

  if (/^(define-se como|definese como)\b/i.test(normalized) || /^chamamos de\b/i.test(normalized)) {
    const namedMatch = cleaned.match(/^(?:Chamamos de|Define-se como)\s+(.{3,80}?)\s+(?:o|a)\s+(.{12,220})$/i);
    if (!namedMatch) {
      return null;
    }

    const topic = sanitizeTopicText(namedMatch[1]);
    if (!isValidRawTopic(topic)) {
      return null;
    }

    return createKnowledgeUnit("definition", topic, `${topic} e ${trimOuterPunctuation(namedMatch[2])}`, cleaned, section, cleaned);
  }

  return extractDefinitionUnit(cleaned, section);
}

function extractSafePurposeUnit(sentence: string, section: TextSection) {
  const cleaned = ensureSentence(sentence);
  const unit = extractPurposeUnit(cleaned, section);
  if (!unit) {
    return null;
  }

  if (isDefinitionStyleAnswer(unit.expectedAnswer, unit.topic)) {
    unit.kind = "definition";
  }

  return unit;
}

function extractSafeFormulaUnit(sentence: string, section: TextSection) {
  return extractFormulaUnit(ensureSentence(sentence), section);
}

function extractSafeProcedureUnit(sentence: string, section: TextSection) {
  const cleaned = ensureSentence(sentence);
  const prompt = buildKnownProcedurePrompt(cleaned, section);
  if (!prompt) {
    return null;
  }

  const sectionTopic = buildSectionContextTopic(section);
  const topic = sectionTopic && isValidRawTopic(sectionTopic) ? sectionTopic : null;

  if (!topic) {
    return null;
  }

  const unit = createKnowledgeUnit("procedure", topic, cleaned, cleaned, section, cleaned);
  if (unit) {
    unit.shortAnswerPrompt = prompt;
    return unit;
  }

  const expectedAnswer = sanitizeAnswerText(cleaned);
  if (
    isRawMetadataText(expectedAnswer) ||
    containsBrokenGeneratedText(expectedAnswer) ||
    containsBlockedRawArtifact(expectedAnswer) ||
    expectedAnswer.length < 40
  ) {
    return null;
  }

  const keywords = extractReferenceKeywords(`${topic} ${expectedAnswer}`, 6);
  if (keywords.length < 2) {
    return null;
  }

  return {
    id: `procedure-${normalizeForComparison(topic)}-${normalizeForComparison(expectedAnswer).slice(0, 72)}`,
    topic,
    sourceText: expectedAnswer,
    kind: "procedure",
    expectedAnswer,
    referenceExcerpt: expectedAnswer,
    keywords,
    sectionTitle: section.title,
    sectionIndex: section.index,
    importance: buildImportance("procedure", topic, expectedAnswer, section.title),
    shortAnswerPrompt: prompt,
  } satisfies KnowledgeUnit;
}

function extractSafeListUnit(sentence: string, section: TextSection) {
  const cleaned = ensureSentence(sentence);
  const listPrompt = buildKnownListPrompt(cleaned);
  if (!listPrompt) {
    return null;
  }

  const unit = createKnowledgeUnit("list", listPrompt.topic, cleaned, cleaned, section, cleaned);
  if (!unit) {
    return null;
  }

  unit.shortAnswerPrompt = listPrompt.prompt;
  return unit;
}

function extractSafeUnitFromSentence(sentence: string, section: TextSection) {
  const cleaned = ensureSentence(sentence);
  const classification = classifyKnowledgeUnit(cleaned);

  switch (classification) {
    case "definition":
      return extractSafeDefinitionUnit(cleaned, section);
    case "purpose":
      return extractSafePurposeUnit(cleaned, section);
    case "formula":
      return extractSafeFormulaUnit(cleaned, section);
    case "procedure":
      return extractSafeProcedureUnit(cleaned, section);
    case "list":
      return extractSafeListUnit(cleaned, section);
    case "comparison":
      return extractComparisonUnit(cleaned, section);
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractSafeUnitFromLine(line: string, section: TextSection) {
  const cleaned = trimOuterPunctuation(line);
  if (!cleaned || isRawMetadataText(cleaned)) {
    return null;
  }

  const inlineStructured = extractUnitsFromStructuredLine(cleaned, section)[0];
  if (inlineStructured && classifyKnowledgeUnit(inlineStructured.referenceExcerpt)) {
    return inlineStructured;
  }

  return extractSafeUnitFromSentence(cleaned, section);
}

function extractUnitsFromStructuredLine(line: string, section: TextSection) {
  const cleaned = trimOuterPunctuation(line);
  if (!cleaned || looksLikeSystemNoise(cleaned)) {
    return [];
  }

  const match = cleaned.match(/^(.{3,110}?)\s+-\s+(.{12,260})$/);
  if (!match) {
    return [];
  }

  const subject = trimOuterPunctuation(match[1]);
  const predicate = trimOuterPunctuation(match[2]);
  if (!isUsefulTopic(subject) || !isCompleteKnowledgeText(predicate)) {
    return [];
  }

  const unit = buildStructuredUnit(subject, predicate, cleaned, section);
  return unit ? [unit] : [];
}

function extractDefinitionUnit(sentence: string, section: TextSection) {
  for (const matcher of definitionMatchers) {
    const match = sentence.match(matcher);
    if (!match) {
      continue;
    }

    const subject = sanitizeTopicText(match[1]);
    if (!isValidRawTopic(subject)) {
      continue;
    }

    const answer = trimOuterPunctuation(match[2]);
    return createKnowledgeUnit("definition", subject, sentence, sentence, section, sentence) ??
      createKnowledgeUnit("definition", subject, `${subject} \u00e9 ${answer}`, sentence, section, sentence);
  }

  return null;
}

function extractPurposeUnit(sentence: string, section: TextSection) {
  for (const matcher of purposeMatchers) {
    const match = sentence.match(matcher);
    if (!match) {
      continue;
    }

    const subject = sanitizeTopicText(match[1]);
    if (!isValidRawTopic(subject)) {
      continue;
    }

    return createKnowledgeUnit("purpose", subject, sentence, sentence, section, sentence);
  }

  return null;
}

function extractComparisonUnit(sentence: string, section: TextSection) {
  for (const matcher of comparisonMatchers) {
    const match = sentence.match(matcher);
    if (!match) {
      continue;
    }

    const topic = titleCase(`${trimOuterPunctuation(match[1])} e ${trimOuterPunctuation(match[2])}`);
    return createKnowledgeUnit("comparison", topic, sentence, sentence, section, sentence);
  }

  if (/\bdiferen(?:ca|\u00e7a) entre\b/i.test(sentence)) {
    const topic = buildTopicFallback(section, sentence);
    return createKnowledgeUnit("comparison", topic, sentence, sentence, section, sentence);
  }

  return null;
}

function extractFormulaUnit(sentence: string, section: TextSection) {
  if (!/=|\bformula|calculad|calculo\b/i.test(sentence)) {
    return null;
  }

  const preferredTopic = buildSectionContextTopic(section);
  const namedFormula = sentence.match(numberedFormulaMatcher);
  const candidateTopic = trimOuterPunctuation(namedFormula?.[1] ?? preferredTopic ?? "");
  const topic = isValidRawTopic(candidateTopic) ? candidateTopic : preferredTopic;

  if (!topic || !isValidRawTopic(topic)) {
    return null;
  }

  return createKnowledgeUnit("formula", topic, sentence, sentence, section, sentence);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function dedupeUnits(units: KnowledgeUnit[]) {
  const seen = new Set<string>();
  const deduped: KnowledgeUnit[] = [];

  for (const unit of units) {
    const key = `${unit.kind}|${normalizeForComparison(unit.topic)}|${normalizeForComparison(unit.expectedAnswer)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(unit);
  }

  return deduped.sort((left, right) => {
    if (right.importance === left.importance) {
      return left.sectionIndex - right.sectionIndex;
    }

    return right.importance - left.importance;
  });
}

function analyzeDocument(document: Document): DocumentAnalysis {
  const structuredQuestions = parseStructuredQuestionnaire(document.cleanedText);
  const sections = extractSections(document.cleanedText);

  if (structuredQuestions.length >= MINIMUM_STRUCTURED_QUESTION_PAIRS) {
    return {
      sections,
      units: [],
      structuredQuestions,
      emphasis: [...new Set(structuredQuestions.map((question) => question.topic))].slice(0, 3),
    };
  }

  // Raw-text question generation was intentionally disabled after the product pivot.
  return {
    sections,
    units: [],
    structuredQuestions: [],
    emphasis: [],
  };
}

function groupBySection(units: KnowledgeUnit[]) {
  const groups = new Map<number, KnowledgeUnit[]>();

  for (const unit of units) {
    const current = groups.get(unit.sectionIndex) ?? [];
    current.push(unit);
    groups.set(unit.sectionIndex, current);
  }

  return groups;
}

function shuffleArray<T>(items: T[]) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  }

  return result;
}

function takeBalancedUnits(units: KnowledgeUnit[], limit: number) {
  const groups = new Map<number, KnowledgeUnit[]>(
    [...groupBySection(units).entries()].map(([sectionIndex, group]) => [sectionIndex, shuffleArray(group)]),
  );
  const baseSectionIndexes = [...groups.keys()].sort((left, right) => left - right);
  const result: KnowledgeUnit[] = [];

  while (result.length < limit) {
    let added = false;
    const sectionIndexes = shuffleArray(baseSectionIndexes);

    for (const sectionIndex of sectionIndexes) {
      const next = groups.get(sectionIndex)?.shift();
      if (!next) {
        continue;
      }

      result.push(next);
      added = true;
      if (result.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }
  }

  return result;
}

function groupStructuredQuestionsBySection(questions: ParsedStructuredQuestion[]) {
  const groups = new Map<number, ParsedStructuredQuestion[]>();

  for (const question of questions) {
    const current = groups.get(question.sectionIndex) ?? [];
    current.push(question);
    groups.set(question.sectionIndex, current);
  }

  return groups;
}

function takeBalancedStructuredQuestions(questions: ParsedStructuredQuestion[], limit: number) {
  const groups = new Map<number, ParsedStructuredQuestion[]>(
    [...groupStructuredQuestionsBySection(questions).entries()].map(([sectionIndex, group]) => [
      sectionIndex,
      shuffleArray(group),
    ]),
  );
  const baseSectionIndexes = [...groups.keys()].sort((left, right) => left - right);
  const result: ParsedStructuredQuestion[] = [];

  while (result.length < limit) {
    let added = false;
    const sectionIndexes = shuffleArray(baseSectionIndexes);

    for (const sectionIndex of sectionIndexes) {
      const next = groups.get(sectionIndex)?.shift();
      if (!next) {
        continue;
      }

      result.push(next);
      added = true;
      if (result.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }
  }

  return result;
}

function selectUnitsByKinds(units: KnowledgeUnit[], kinds: KnowledgeKind[], limit: number) {
  const filtered = units.filter((unit) => kinds.includes(unit.kind));
  return takeBalancedUnits(filtered, limit);
}

function buildExpectedAnswer(unit: KnowledgeUnit) {
  return unit.expectedAnswer;
}

function buildReferenceExcerpt(unit: KnowledgeUnit) {
  return unit.referenceExcerpt;
}

function extractRubricHighlights(unit: KnowledgeUnit, limit = 5) {
  const source = sanitizeAnswerText(unit.referenceExcerpt || unit.expectedAnswer);
  const acronymMatches = source.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/g) ?? [];
  const phraseMatches = source.match(/\b(?:nota fiscal|impacto nos clientes|impacto nas vendas|carga seca|carga congelada|volume de oferta|saida media|cobertura de estoque|estoque padrao(?: final| tradicional)?|produtos nao atendidos|falta x excesso)\b/gi) ?? [];
  const keywordMatches = extractReferenceKeywords(source, limit + 4).filter(
    (keyword) => !["deve", "caso", "cliente", "direto", "consequentemente"].includes(keyword),
  );

  const merged = [
    ...acronymMatches,
    ...phraseMatches.map((match) => titleCase(match)),
    ...keywordMatches.map((keyword) => titleCase(keyword)),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(merged)].slice(0, limit);
}

function buildRubric(unit: KnowledgeUnit, limit = 4) {
  const keywords = extractRubricHighlights(unit, limit).filter(
    (keyword) => normalizeForComparison(keyword) !== normalizeForComparison(unit.topic),
  );

  if (keywords.length === 0) {
    return "Recupere a ideia central com suas palavras.";
  }

  return `Pontos que vale mencionar: ${keywords.slice(0, limit).join("; ")}.`;
}

function isDefinitionStyleAnswer(answer: string, topic: string) {
  const normalizedAnswer = normalizeForComparison(answer);
  const normalizedTopic = normalizeForComparison(topic);

  return (
    normalizedAnswer.startsWith(`${normalizedTopic} e `) ||
    /^e\s+(?:a|o|um|uma)\b/.test(normalizedAnswer) ||
    /\b(significa|corresponde a|refere se a|consiste em)\b/.test(normalizedAnswer)
  );
}

function isPurposeStyleAnswer(answer: string) {
  return /\b(serve para|permite|visa|ajuda a|finalidade)\b/.test(normalizeForComparison(answer));
}

function buildPurposePrompt(unit: KnowledgeUnit) {
  if (isDefinitionStyleAnswer(unit.expectedAnswer, unit.topic)) {
    return `O que e ${unit.topic}?`;
  }

  if (isPurposeStyleAnswer(unit.expectedAnswer)) {
    return `Para que serve ${unit.topic}?`;
  }

  return `Qual e a finalidade de ${unit.topic}?`;
}

function buildDirectPrompt(unit: KnowledgeUnit) {
  if (unit.shortAnswerPrompt) {
    return unit.shortAnswerPrompt;
  }

  switch (unit.kind) {
    case "definition":
      return `O que e ${unit.topic}?`;
    case "purpose":
      return buildPurposePrompt(unit);
    case "procedure":
      return `Quais sao os principais procedimentos de ${unit.topic}?`;
    case "rule":
      return `Qual regra deve ser observada em ${unit.topic}?`;
    case "formula":
      return `Como e calculado ${unit.topic}?`;
    case "comparison":
      return `Qual e a diferenca entre ${unit.topic}?`;
    case "list":
      return `Quais itens compoem ${unit.topic}?`;
  }
}

function buildQuickReviewPrompt(unit: KnowledgeUnit) {
  if (unit.shortAnswerPrompt) {
    return unit.shortAnswerPrompt;
  }

  switch (unit.kind) {
    case "definition":
      return `O que e ${unit.topic}?`;
    case "purpose":
      return buildPurposePrompt(unit);
    case "procedure":
      return `Quais sao os principais procedimentos de ${unit.topic}?`;
    case "rule":
      return `Qual regra deve ser observada em ${unit.topic}?`;
    case "formula":
      return `Como e calculado ${unit.topic}?`;
    case "comparison":
      return `Qual e a diferenca entre ${unit.topic}?`;
    case "list":
      return `Quais itens compoem ${unit.topic}?`;
  }
}

function buildFeynmanPrompt(unit: KnowledgeUnit) {
  return `Explique ${unit.topic.toLowerCase()} como se estivesse ensinando a um colega novo.`;
}

function buildMultipleChoicePrompt(unit: KnowledgeUnit) {
  switch (unit.kind) {
    case "definition":
      return `Qual alternativa descreve corretamente o conceito de ${unit.topic}?`;
    case "purpose":
      return `Qual alternativa descreve corretamente a finalidade de ${unit.topic}?`;
    case "procedure":
      return `Qual alternativa descreve corretamente os procedimentos de ${unit.topic}?`;
    case "rule":
      return `Qual alternativa descreve corretamente a regra em ${unit.topic}?`;
    case "formula":
      return `Qual alternativa descreve corretamente como ${unit.topic} e calculado?`;
    case "comparison":
      return `Qual alternativa diferencia corretamente ${unit.topic}?`;
    case "list":
      return `Qual alternativa lista corretamente os itens de ${unit.topic}?`;
  }
}

function buildFlashcardPrompt(unit: KnowledgeUnit) {
  return unit.topic;
}

function buildChoiceId(unit: KnowledgeUnit, index: number) {
  return `${normalizeForComparison(unit.topic)}-${index + 1}`;
}

function isBadAlternativeText(value: string) {
  const cleaned = ensureSentence(value);
  const normalized = normalizeForComparison(cleaned);
  return (
    !isDidacticAnswerText(cleaned) ||
    startsLikeBadFragment(cleaned) ||
    cleaned.length > 220 ||
    invalidTopicContentMatcher.test(cleaned) ||
    /^[a-z]/.test(cleaned) ||
    /^(garantindo|efetuando|realizando|validando|apos)\b/i.test(normalized) ||
    /^.{0,25}\b(e|ou|mas)\b\s+[a-z]/.test(cleaned)
  );
}

function hasComparableLength(left: string, right: string) {
  const leftWords = countWords(left);
  const rightWords = countWords(right);

  if (leftWords === 0 || rightWords === 0) {
    return false;
  }

  const ratio = leftWords / rightWords;
  return ratio >= 0.55 && ratio <= 1.8;
}

function buildDistractorPool(unit: KnowledgeUnit, units: KnowledgeUnit[]) {
  if (!["definition", "purpose", "formula"].includes(unit.kind)) {
    return [];
  }

  return units
    .filter((candidate) => candidate.id !== unit.id)
    .filter((candidate) => candidate.kind === unit.kind)
    .filter((candidate) => Math.abs(candidate.sectionIndex - unit.sectionIndex) <= 2)
    .filter((candidate) => !isBadAlternativeText(candidate.expectedAnswer))
    .filter((candidate) => normalizeForComparison(candidate.expectedAnswer) !== normalizeForComparison(unit.expectedAnswer))
    .filter((candidate) => conceptSimilarity(candidate.expectedAnswer, unit.expectedAnswer) < 0.72)
    .filter((candidate) => hasComparableLength(candidate.expectedAnswer, unit.expectedAnswer))
    .sort((left, right) => {
      const leftScore =
        conceptSimilarity(`${left.topic} ${left.referenceExcerpt}`, `${unit.topic} ${unit.referenceExcerpt}`) +
        (left.sectionIndex === unit.sectionIndex ? 0.25 : 0) +
        left.importance / 20;
      const rightScore =
        conceptSimilarity(`${right.topic} ${right.referenceExcerpt}`, `${unit.topic} ${unit.referenceExcerpt}`) +
        (right.sectionIndex === unit.sectionIndex ? 0.25 : 0) +
        right.importance / 20;
      return rightScore - leftScore;
    });
}

function validateMultipleChoiceChoices(correctAnswer: string, choices: QuestionChoice[]) {
  if (choices.length !== 4) {
    return false;
  }

  const normalizedLabels = choices.map((choice) => buildPromptSignature(choice.label));
  if (new Set(normalizedLabels).size !== choices.length) {
    return false;
  }

  if (!choices.some((choice) => buildPromptSignature(choice.label) === buildPromptSignature(correctAnswer))) {
    return false;
  }

  const correctChoice = choices.find(
    (choice) => buildPromptSignature(choice.label) === buildPromptSignature(correctAnswer),
  );
  if (!correctChoice) {
    return false;
  }

  for (const choice of choices) {
    if (isBadAlternativeText(choice.label)) {
      return false;
    }

    if (
      choice.id !== correctChoice.id &&
      conceptSimilarity(choice.label, correctAnswer) >= 0.82
    ) {
      return false;
    }

    if (!hasComparableLength(choice.label, correctAnswer)) {
      return false;
    }
  }

  return true;
}

function rotateChoices(choices: QuestionChoice[], seed: number) {
  const index = seed % choices.length;
  return [...choices.slice(index), ...choices.slice(0, index)];
}

function createMultipleChoiceQuestion(unit: KnowledgeUnit, units: KnowledgeUnit[]) {
  const distractors = buildDistractorPool(unit, units);
  const selected = distractors.slice(0, 3);

  if (selected.length < 3) {
    console.warn(`[quiz-generator] discarded bad multiple choice options: ${unit.topic}`);
    return null;
  }

  const choices = rotateChoices(
    [
      { id: buildChoiceId(unit, 0), label: unit.expectedAnswer },
      ...selected.map((candidate, index) => ({
        id: buildChoiceId(candidate, index + 1),
        label: candidate.expectedAnswer,
      })),
    ],
    unit.importance,
  );

  if (!validateMultipleChoiceChoices(unit.expectedAnswer, choices)) {
    console.warn(`[quiz-generator] discarded bad multiple choice options: ${unit.topic}`);
    return null;
  }

  return {
    question: {
      type: "MULTIPLE_CHOICE",
      prompt: buildMultipleChoicePrompt(unit),
      topic: unit.topic,
      choices,
      correctAnswer: unit.expectedAnswer,
      explanation: unit.expectedAnswer,
    } satisfies QuestionDraft,
    unit,
  } satisfies GeneratedQuestionCandidate;
}

function createShortAnswerQuestion(unit: KnowledgeUnit, promptBuilder: (unit: KnowledgeUnit) => string) {
  return {
    question: {
      type: "SHORT_ANSWER",
      prompt: promptBuilder(unit),
      topic: unit.topic,
      correctAnswer: buildExpectedAnswer(unit),
      referenceAnswer: buildReferenceExcerpt(unit),
      rubric: buildRubric(unit),
      explanation: "A resposta ideal recupera a ideia central com suas palavras.",
    } satisfies QuestionDraft,
    unit,
  } satisfies GeneratedQuestionCandidate;
}

function createFlashcardQuestion(unit: KnowledgeUnit) {
  return {
    question: {
      type: "FLASHCARD",
      prompt: buildFlashcardPrompt(unit),
      topic: unit.topic,
      correctAnswer: buildExpectedAnswer(unit),
      referenceAnswer: buildReferenceExcerpt(unit),
      explanation: "Compare a resposta esperada com o trecho de apoio antes de marcar.",
    } satisfies QuestionDraft,
    unit,
  } satisfies GeneratedQuestionCandidate;
}

function buildStructuredRubric(question: ParsedStructuredQuestion, limit = 4) {
  const keywords = extractReferenceKeywords(`${question.prompt} ${question.expectedAnswer}`, limit);
  if (keywords.length === 0) {
    return "Recupere os pontos centrais da resposta original.";
  }

  if (keywords.length === 1) {
    return `Mencione ${keywords[0]} ao responder.`;
  }

  return `Mencione ${keywords.slice(0, -1).join(", ")} e ${keywords[keywords.length - 1]} ao responder.`;
}

function buildAssociationPrompt(question: ParsedStructuredQuestion) {
  const item = question.associationItem ?? question.prompt;
  return `${item} esta associada a que?`;
}

function createStructuredShortAnswerQuestion(
  question: ParsedStructuredQuestion,
  responseFormat: QuestionResponseFormat = "SHORT",
  prompt = question.promptStyle === "ASSOCIATION" ? buildAssociationPrompt(question) : question.prompt,
): QuestionDraft {
  return {
    type: "SHORT_ANSWER",
    prompt,
    topic: question.topic,
    responseFormat,
    correctAnswer: question.expectedAnswer,
    referenceAnswer: question.referenceExcerpt,
    rubric: buildStructuredRubric(question),
    explanation: "A resposta ideal deve recuperar a resposta original com fidelidade.",
  };
}

function createStructuredFlashcardQuestion(question: ParsedStructuredQuestion): QuestionDraft {
  return {
    type: "FLASHCARD",
    prompt: question.promptStyle === "ASSOCIATION" ? (question.associationItem ?? question.prompt) : question.prompt,
    topic: question.topic,
    correctAnswer: question.expectedAnswer,
    referenceAnswer: question.referenceExcerpt,
    explanation: "Compare o verso com a resposta original antes de marcar seu desempenho.",
  };
}

function buildStructuredFeynmanPrompt(question: ParsedStructuredQuestion) {
  const basePrompt = question.promptStyle === "ASSOCIATION" ? buildAssociationPrompt(question) : question.prompt;
  return `Explique com suas palavras: ${basePrompt}`;
}

function createStructuredDiscursiveQuestion(question: ParsedStructuredQuestion): QuestionDraft {
  return createStructuredShortAnswerQuestion(question, "LONG");
}

function createStructuredFeynmanQuestion(question: ParsedStructuredQuestion): QuestionDraft {
  return createStructuredShortAnswerQuestion(question, "LONG", buildStructuredFeynmanPrompt(question));
}

function buildTrueFalseStatement(
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) {
  const distractor = buildStructuredDistractorPool(question, questions)[0];
  const useCorrectStatement =
    (normalizeForComparison(question.prompt).length + countWords(question.expectedAnswer) + question.sectionIndex) % 2 === 0 ||
    !distractor;

  return useCorrectStatement
    ? {
        statement: question.expectedAnswer,
        correctAnswer: "true",
        explanation: question.expectedAnswer,
      }
    : {
        statement: distractor.expectedAnswer,
        correctAnswer: "false",
        explanation: question.expectedAnswer,
      };
}

function createStructuredTrueFalseQuestion(
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) {
  if (!question.expectedAnswer || question.expectedAnswer.length < 12 || question.promptStyle === "ASSOCIATION") {
    return null;
  }

  const statement = buildTrueFalseStatement(question, questions);
  if (!isSafeStructuredAlternative(statement.statement)) {
    return null;
  }

  return {
    type: "TRUE_FALSE",
    prompt: `Verdadeiro ou falso: ${statement.statement}`,
    topic: question.topic,
    correctAnswer: statement.correctAnswer,
    explanation: statement.explanation,
    referenceAnswer: question.referenceExcerpt,
  } satisfies QuestionDraft;
}

function selectFillBlankToken(answer: string) {
  const numberMatch = answer.match(/\b\d+(?:[.,]\d+)?%?\b/);
  if (numberMatch) {
    return numberMatch[0];
  }

  const keyword = extractReferenceKeywords(answer, 6).find((token) => token.length >= 4);
  return keyword ?? null;
}

function createStructuredFillBlankQuestion(question: ParsedStructuredQuestion) {
  if (question.promptStyle === "ASSOCIATION") {
    return null;
  }

  const token = selectFillBlankToken(question.expectedAnswer);
  if (!token) {
    return null;
  }

  const matcher = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (!matcher.test(question.expectedAnswer)) {
    return null;
  }

  const prompt = question.expectedAnswer.replace(matcher, "_____");
  if (prompt === question.expectedAnswer || prompt.length < 18) {
    return null;
  }

  return {
    type: "FILL_BLANK",
    prompt: `Complete a lacuna: ${prompt}`,
    topic: question.topic,
    correctAnswer: token,
    explanation: question.expectedAnswer,
    referenceAnswer: question.referenceExcerpt,
  } satisfies QuestionDraft;
}

function hasLooselyComparableLength(left: string, right: string) {
  const leftWords = countWords(left);
  const rightWords = countWords(right);

  if (leftWords === 0 || rightWords === 0) {
    return false;
  }

  const ratio = leftWords / rightWords;
  return ratio >= 0.4 && ratio <= 2.4;
}

function isSafeStructuredAlternative(value: string) {
  const cleaned = trimOuterPunctuation(value);
  return (
    cleaned.length >= 6 &&
    !/^(?:p|r|pergunta|resposta|resposta esperada|gabarito)\s*[:\-]/i.test(cleaned) &&
    !cleaned.endsWith("?") &&
    !looksLikeSystemNoise(cleaned) &&
    !hasBrokenExtractionSymbols(cleaned) &&
    !isMetaInstructionLine(cleaned)
  );
}

function buildStructuredChoiceId(question: ParsedStructuredQuestion, index: number) {
  return `${normalizeForComparison(question.topic || question.prompt).slice(0, 48)}-${index + 1}`;
}

function buildStructuredDistractorPool(
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) {
  return questions
    .filter((candidate) => candidate.prompt !== question.prompt)
    .filter(
      (candidate) =>
        normalizeForComparison(candidate.expectedAnswer) !== normalizeForComparison(question.expectedAnswer),
    )
    .filter((candidate) => isSafeStructuredAlternative(candidate.expectedAnswer))
    .filter((candidate) => conceptSimilarity(candidate.expectedAnswer, question.expectedAnswer) < 0.82)
    .filter((candidate) => hasLooselyComparableLength(candidate.expectedAnswer, question.expectedAnswer))
    .sort((left, right) => {
      const leftScore =
        (question.promptStyle === "ASSOCIATION" &&
        left.associationGroup &&
        left.associationGroup === question.associationGroup
          ? 2
          : 0) +
        (left.sectionIndex === question.sectionIndex ? 1 : 0) +
        conceptSimilarity(`${left.topic} ${left.prompt}`, `${question.topic} ${question.prompt}`);
      const rightScore =
        (question.promptStyle === "ASSOCIATION" &&
        right.associationGroup &&
        right.associationGroup === question.associationGroup
          ? 2
          : 0) +
        (right.sectionIndex === question.sectionIndex ? 1 : 0) +
        conceptSimilarity(`${right.topic} ${right.prompt}`, `${question.topic} ${question.prompt}`);
      return rightScore - leftScore;
    });
}

function validateStructuredMultipleChoiceChoices(correctAnswer: string, choices: QuestionChoice[]) {
  if (choices.length !== 4) {
    return false;
  }

  const signatures = choices.map((choice) => buildPromptSignature(choice.label));
  if (new Set(signatures).size !== choices.length) {
    return false;
  }

  if (!choices.some((choice) => buildPromptSignature(choice.label) === buildPromptSignature(correctAnswer))) {
    return false;
  }

  return choices.every((choice) => {
    if (!isSafeStructuredAlternative(choice.label)) {
      return false;
    }

    if (buildPromptSignature(choice.label) === buildPromptSignature(correctAnswer)) {
      return true;
    }

    return (
      conceptSimilarity(choice.label, correctAnswer) < 0.86 &&
      hasLooselyComparableLength(choice.label, correctAnswer)
    );
  });
}

function createStructuredMultipleChoiceQuestion(
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) {
  if (
    !question.prompt ||
    /^(?:qual alternativa define melhor p:|qual alternativa resume melhor a regra sobre r:)/i.test(question.prompt) ||
    /(?:^|[\s(])(p|r)\s*:/i.test(question.prompt)
  ) {
    return null;
  }

  const selected = buildStructuredDistractorPool(question, questions).slice(0, 3);
  if (selected.length < 3) {
    return null;
  }

  const choices = rotateChoices(
    [
      { id: buildStructuredChoiceId(question, 0), label: question.expectedAnswer },
      ...selected.map((candidate, index) => ({
        id: buildStructuredChoiceId(candidate, index + 1),
        label: candidate.expectedAnswer,
      })),
    ],
    countWords(question.expectedAnswer),
  );

  if (!validateStructuredMultipleChoiceChoices(question.expectedAnswer, choices)) {
    return null;
  }

  return {
    type: "MULTIPLE_CHOICE",
    prompt: question.promptStyle === "ASSOCIATION" ? `${question.associationItem ?? question.prompt} esta associada a qual descricao?` : question.prompt,
    topic: question.topic,
    choices,
    correctAnswer: question.expectedAnswer,
    explanation: question.expectedAnswer,
  } satisfies QuestionDraft;
}

function areQuestionsTooSimilar(left: QuestionDraft, right: QuestionDraft) {
  return (
    buildPromptSignature(left.prompt) === buildPromptSignature(right.prompt) ||
    conceptSimilarity(left.prompt, right.prompt) >= 0.9
  );
}

function isKnownLongRawTopic(normalizedTopic: string) {
  return /^(relatorio de produtos nao atendidos|relatorio de falta x excesso|alteracao de pedidos paes industrializados|alteracao de pedido sistematica \d+|gestao de estoque cobertura)$/.test(
    normalizedTopic,
  );
}

function isValidRawTopic(topic: string) {
  const cleaned = sanitizeTopicText(topic);
  const normalized = normalizeForComparison(cleaned);
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    isUsefulTopic(cleaned) &&
    !isRawMetadataText(cleaned) &&
    !isBlockedRawLabel(cleaned) &&
    !containsBrokenGeneratedText(cleaned) &&
    !containsBlockedRawArtifact(cleaned) &&
    isWhitelistedRawTopic(normalized) &&
    !isBlockedRawTopicStart(normalized) &&
    !/^apos\b/i.test(normalized) &&
    !/^oferta\b/i.test(normalized) &&
    !/^todos?\s+os\b/i.test(normalized) &&
    !/^toda\s+a\b/i.test(normalized) &&
    !/^(categoria|categorias|produto|produtos)\s+que\b/i.test(normalized) &&
    !/^sabemos tambem\b/i.test(normalized) &&
    !/^o ajuste deve\b/i.test(normalized) &&
    !/^quanto a\b/i.test(normalized) &&
    !/^o impacto\b/i.test(normalized) &&
    !/^o aep\b/i.test(normalized) &&
    !/saida media\s*\*\s*cobertura/i.test(normalized) &&
    !hasConjugatedVerb(normalized) &&
    !/(?:\b(opcao|menu|botao|tela|campo|exportar|acesso)\b)/.test(normalized) &&
    !/[,:]/.test(cleaned) &&
    !/\b(de|da|do|para|com|que)$/.test(normalized) &&
    (words.length <= 7 || isKnownLongRawTopic(normalized))
  );
}

function getAlignmentTopicTokens(topic: string) {
  return normalizeForComparison(topic)
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (token) =>
        token.length >= 4 &&
        ![
          "para",
          "com",
          "sem",
          "sobre",
          "entre",
          "item",
          "itens",
          "essa",
          "esse",
          "esta",
          "este",
        ].includes(token),
    )
    .filter(
      (token) =>
        ![
          "basico",
          "basicos",
          "procedimento",
          "procedimentos",
          "principal",
          "principais",
          "processo",
          "processos",
          "regra",
          "regras",
          "rotina",
          "rotinas",
          "passo",
          "passos",
          "lista",
          "listas",
          "item",
          "itens",
        ].includes(token),
    );
}

function containsSpecificAnswerDetail(answer: string) {
  return /\b(placa|avarias|mercadoria|impropria|consumo|danificad|gondola|oferta|carga seca|congelad)\b/i.test(
    normalizeForComparison(answer),
  );
}

function isPromptAnswerAligned(prompt: string, expectedAnswer: string, topic: string, kind?: KnowledgeKind) {
  const normalizedPrompt = normalizeForComparison(prompt);
  const normalizedAnswer = normalizeForComparison(expectedAnswer);
  const isMultipleChoicePrompt = /^qual alternativa\b/.test(normalizedPrompt);

  if (/^que problema\b/.test(normalizedPrompt)) {
    return false;
  }

  if (kind === "definition") {
    if (isMultipleChoicePrompt) {
      return /\bconceito de\b/.test(normalizedPrompt);
    }

    return /^o que e\b/.test(normalizedPrompt);
  }

  if (kind === "purpose") {
    if (isMultipleChoicePrompt) {
      return /\bfinalidade de\b/.test(normalizedPrompt) || /\bpara que serve\b/.test(normalizedPrompt);
    }

    if (isDefinitionStyleAnswer(expectedAnswer, topic)) {
      return /^o que e\b/.test(normalizedPrompt) || /^qual e a finalidade de\b/.test(normalizedPrompt);
    }

    return /^para que serve\b/.test(normalizedPrompt) || /^qual e a finalidade de\b/.test(normalizedPrompt);
  }

  if (kind === "formula") {
    if (isMultipleChoicePrompt) {
      return /\bcalculad\b/.test(normalizedPrompt);
    }

    return /\bcalculad|\bcalculo\b/.test(normalizedPrompt);
  }

  if (kind === "list") {
    if (isMultipleChoicePrompt) {
      return /\blista corretamente os itens de\b/.test(normalizedPrompt);
    }

    if (!/\b(quais itens compoem|quais sao os itens de)\b/i.test(normalizedPrompt)) {
      return false;
    }
  }

  if (kind === "rule") {
    if (isMultipleChoicePrompt) {
      return /\bregra em\b/.test(normalizedPrompt);
    }

    if (!/\bqual regra deve ser observada\b/i.test(normalizedPrompt)) {
      return false;
    }
  }

  if (kind === "procedure" && isMultipleChoicePrompt) {
    return /\bprocedimentos de\b/.test(normalizedPrompt);
  }

  if (kind === "comparison" && isMultipleChoicePrompt) {
    return /\bdiferencia corretamente\b/.test(normalizedPrompt);
  }

  if (
    /^como funciona a sistematica\b/.test(normalizedPrompt) ||
    /^o que o aep deve fazer\b/.test(normalizedPrompt) ||
    /^o que deve acontecer apos a validacao\b/.test(normalizedPrompt) ||
    /^em qual horario as lojas podem alterar\b/.test(normalizedPrompt)
  ) {
    return true;
  }

  if (kind === "rule" || kind === "procedure" || kind === "list") {
    const tokens = getAlignmentTopicTokens(topic);
    if (tokens.length > 0 && !tokens.some((token) => normalizedAnswer.includes(token))) {
      return false;
    }
  }

  if (containsSpecificAnswerDetail(expectedAnswer)) {
    const detailTokens = ["placa", "avarias", "mercadoria", "impropria", "consumo", "gondola", "oferta"];
    if (!detailTokens.some((token) => normalizedPrompt.includes(token))) {
      return false;
    }
  }

  return true;
}

function getQuestionDraftRejectionReason(
  question: QuestionDraft,
  answerReference: string,
  options?: { enforceAlignment?: boolean; structured?: boolean; kind?: KnowledgeKind },
) {
  const minimumPromptLength = question.type === "FLASHCARD" ? 3 : 10;
  const normalizedPrompt = normalizeForComparison(question.prompt);
  const normalizedAnswer = normalizeForComparison(answerReference);

  if (!question.prompt || question.prompt.length < minimumPromptLength) {
    return "prompt curto demais";
  }

  if (hasBrokenExtractionSymbols(question.prompt) || hasBrokenExtractionSymbols(answerReference)) {
    return "simbolos quebrados";
  }

  if (
    containsBrokenGeneratedText(question.prompt) ||
    containsBrokenGeneratedText(question.topic) ||
    containsBrokenGeneratedText(answerReference) ||
    question.choices?.some((choice) => containsBrokenGeneratedText(choice.label))
  ) {
    return "artefatos quebrados";
  }

  if (looksLikeSystemNoise(question.prompt) || blockedGeneratedPromptMatcher.test(normalizedPrompt)) {
    return "prompt com ruido";
  }

  if (
    invalidTopicContentMatcher.test(question.prompt) ||
    (!options?.structured &&
      (
        /^o que e (o|a|os|as|quanto|exemplo|resumo)\b/i.test(normalizedPrompt) ||
        /^resuma em uma frase o conceito de\b/i.test(normalizedPrompt) ||
        /^que problema\b/i.test(normalizedPrompt) ||
        /^qual alternativa corresponde melhor a\b/i.test(normalizedPrompt) ||
        /^qual alternativa define melhor\b/i.test(normalizedPrompt) ||
        /^qual alternativa resume melhor a regra sobre\b/i.test(normalizedPrompt) ||
        /qual alternativa (?:corresponde|descreve) melhor a [\p{L}\d\s*+/-]+$/iu.test(normalizedPrompt) ||
        formulaOnlyTopicMatcher.test(question.prompt)
      ))
  ) {
    return "prompt invalido";
  }

  if (!options?.structured) {
    if (isRawMetadataText(answerReference)) {
      return "resposta com metadado";
    }

    if (
      options?.kind !== "formula" &&
      question.type !== "FLASHCARD" &&
      answerReference.length < 40
    ) {
      return "resposta curta demais";
    }

    if (
      /^rio de janeiro\b/i.test(normalizedAnswer) ||
      /\bdezembro de \d{4}\b/i.test(normalizedAnswer) ||
      /^manual de /i.test(normalizedAnswer)
    ) {
      return "resposta com metadado";
    }
  }

  if (!options?.structured && !isValidRawTopic(question.topic)) {
    return "topico invalido";
  }

  if (question.type === "MULTIPLE_CHOICE" && question.choices) {
    const isValidChoices = options?.structured
      ? Boolean(question.correctAnswer) && validateStructuredMultipleChoiceChoices(question.correctAnswer!, question.choices)
      : Boolean(question.correctAnswer) && validateMultipleChoiceChoices(question.correctAnswer!, question.choices);

    if (!isValidChoices) {
      return "alternativas inconsistentes";
    }
  }

  if (options?.enforceAlignment && !isPromptAnswerAligned(question.prompt, answerReference, question.topic, options.kind)) {
    return "prompt e resposta desalinhados";
  }

  return null;
}

function validateGeneratedQuestion(
  question: QuestionDraft,
  answerReference: string,
  options?: { enforceAlignment?: boolean; structured?: boolean; kind?: KnowledgeKind },
) {
  return getQuestionDraftRejectionReason(question, answerReference, options) === null;
}

function logDiscardedQuestion(reason: string, question: QuestionDraft) {
  if (reason === "topico invalido") {
    console.warn(`[quiz-generator] discarded invalid topic: ${question.topic}`);
    return;
  }

  if (reason === "artefatos quebrados" || reason === "simbolos quebrados" || reason === "prompt com ruido") {
    console.warn(`[quiz-generator] discarded noisy text: ${question.prompt}`);
    return;
  }

  if (reason === "prompt e resposta desalinhados") {
    console.warn(`[quiz-generator] discarded misaligned prompt: ${question.prompt}`);
    return;
  }

  if (reason === "alternativas inconsistentes") {
    console.warn(`[quiz-generator] discarded bad multiple choice options: ${question.prompt}`);
    return;
  }

  console.warn(`[quiz-generator] discarded question (${reason}): ${question.prompt}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function uniqueQuestions(candidates: Array<GeneratedQuestionCandidate | null>) {
  const accepted: QuestionDraft[] = [];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const sanitizedQuestion = sanitizeQuestionDraft(candidate.question);
    const sanitizedAnswerReference =
      sanitizedQuestion.correctAnswer ?? sanitizedQuestion.referenceAnswer ?? sanitizeAnswerText(candidate.unit.expectedAnswer);
    const rejectionReason = getQuestionDraftRejectionReason(sanitizedQuestion, sanitizedAnswerReference, {
      enforceAlignment: sanitizedQuestion.type !== "FLASHCARD",
      kind: candidate.unit.kind,
    });

    if (!validateGeneratedQuestion(sanitizedQuestion, sanitizedAnswerReference, {
      enforceAlignment: sanitizedQuestion.type !== "FLASHCARD",
      kind: candidate.unit.kind,
    }) && rejectionReason) {
      logDiscardedQuestion(rejectionReason, sanitizedQuestion);
      continue;
    }

    if (accepted.some((question) => areQuestionsTooSimilar(question, sanitizedQuestion))) {
      logDiscardedQuestion("duplicada ou muito parecida", sanitizedQuestion);
      continue;
    }

    accepted.push(sanitizedQuestion);
  }

  if (accepted.length > 0) {
    return accepted;
  }

  return [];
}

function uniqueStructuredQuestions(questions: QuestionDraft[]) {
  const accepted: QuestionDraft[] = [];

  for (const question of questions) {
    const sanitizedQuestion = sanitizeQuestionDraft(question);
    const answerReference = sanitizedQuestion.correctAnswer ?? sanitizedQuestion.referenceAnswer ?? "";
    const rejectionReason = getQuestionDraftRejectionReason(sanitizedQuestion, answerReference, { structured: true });

    if (!validateGeneratedQuestion(sanitizedQuestion, answerReference, { structured: true }) && rejectionReason) {
      logDiscardedQuestion(rejectionReason, sanitizedQuestion);
      continue;
    }

    if (accepted.some((current) => areQuestionsTooSimilar(current, sanitizedQuestion))) {
      logDiscardedQuestion("duplicada ou muito parecida", sanitizedQuestion);
      continue;
    }

    accepted.push(sanitizedQuestion);
  }

  return accepted;
}

function getAllowedCompositions(mode: QuizMode): QuizComposition[] {
  if (mode === "FEYNMAN") {
    return ["DISCURSIVE_ONLY"];
  }

  if (mode === "FLASHCARDS") {
    return ["AUTO"];
  }

  return ["AUTO", "MULTIPLE_CHOICE_ONLY", "DISCURSIVE_ONLY"];
}

function resolveCompositionForMode(mode: QuizMode, composition?: QuizComposition) {
  const allowed = getAllowedCompositions(mode);
  return allowed.includes(composition ?? "AUTO") ? (composition ?? "AUTO") : allowed[0];
}

function buildCompositionDescription(mode: QuizMode, composition: QuizComposition) {
  if (mode === "FEYNMAN") {
    return "Sempre discursivo, com explicacoes e reformulacao didatica.";
  }

  if (mode === "FLASHCARDS") {
    return "Formato fixo de frente e verso para revisao rapida.";
  }

  if (mode === "QUICK_REVIEW" && composition === "AUTO") {
    return "Prioriza multipla escolha, verdadeiro ou falso, lacunas e respostas curtas.";
  }

  if (mode === "DEEP_DIVE" && composition === "AUTO") {
    return "Mistura perguntas objetivas com explicacoes curtas e discursivas.";
  }

  if (mode === "EXAM" && composition === "AUTO") {
    return "Combina perguntas objetivas e discursivas para uma rodada mais completa.";
  }

  if (composition === "MULTIPLE_CHOICE_ONLY") {
    return "Usa apenas itens objetivos com alternativas plausiveis.";
  }

  if (composition === "DISCURSIVE_ONLY") {
    return mode === "QUICK_REVIEW"
      ? "Usa respostas curtas e diretas, sem alternativas."
      : "Usa apenas perguntas discursivas e respostas escritas.";
  }

  return "Combina os tipos mais adequados para este modo.";
}

type StructuredQuestionBuilder = (
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) => QuestionDraft | null;

function createStructuredQuestionSet(
  questions: ParsedStructuredQuestion[],
  strategies: StructuredQuestionBuilder[],
  limit: number,
) {
  const result: QuestionDraft[] = [];

  for (let index = 0; index < questions.length && result.length < limit; index += 1) {
    const question = questions[index];

    for (let offset = 0; offset < strategies.length; offset += 1) {
      const strategy = strategies[(index + offset) % strategies.length];
      const candidate = strategy(question, questions);
      if (!candidate) {
        continue;
      }

      result.push(candidate);
      break;
    }
  }

  return result;
}

function rankQuestionsForDeepDive(questions: ParsedStructuredQuestion[]) {
  return [...questions].sort((left, right) => {
    const leftScore =
      countWords(left.expectedAnswer) +
      (/como|por que|explique|compare|aplique|diferenca|causa/i.test(left.prompt) ? 6 : 0);
    const rightScore =
      countWords(right.expectedAnswer) +
      (/como|por que|explique|compare|aplique|diferenca|causa/i.test(right.prompt) ? 6 : 0);
    return rightScore - leftScore;
  });
}

function buildStructuredQuestionCandidates(
  questions: ParsedStructuredQuestion[],
  mode: QuizMode,
  composition: QuizComposition,
) {
  const target = getTargetQuestionCount(mode);
  const selectionSize = Math.max(target * 2, 24);
  const selected =
    mode === "DEEP_DIVE" || mode === "FEYNMAN"
      ? rankQuestionsForDeepDive(takeBalancedStructuredQuestions(questions, selectionSize))
      : takeBalancedStructuredQuestions(questions, selectionSize);
  const multipleChoice: StructuredQuestionBuilder = (question, currentQuestions) =>
    createStructuredMultipleChoiceQuestion(question, currentQuestions);
  const trueFalse: StructuredQuestionBuilder = (question, currentQuestions) =>
    createStructuredTrueFalseQuestion(question, currentQuestions);
  const fillBlank: StructuredQuestionBuilder = (question) => createStructuredFillBlankQuestion(question);
  const shortAnswer: StructuredQuestionBuilder = (question) =>
    createStructuredShortAnswerQuestion(question, "SHORT");
  const discursive: StructuredQuestionBuilder = (question) => createStructuredDiscursiveQuestion(question);
  const feynman: StructuredQuestionBuilder = (question) => createStructuredFeynmanQuestion(question);
  const flashcard: StructuredQuestionBuilder = (question) => createStructuredFlashcardQuestion(question);

  if (mode === "FLASHCARDS") {
    return createStructuredQuestionSet(selected, [flashcard], target);
  }

  if (mode === "FEYNMAN") {
    return createStructuredQuestionSet(selected, [feynman], target);
  }

  if (composition === "MULTIPLE_CHOICE_ONLY") {
    return createStructuredQuestionSet(selected, [multipleChoice], target);
  }

  if (mode === "QUICK_REVIEW") {
    if (composition === "DISCURSIVE_ONLY") {
      return createStructuredQuestionSet(selected, [shortAnswer], target);
    }

    return createStructuredQuestionSet(selected, [multipleChoice, trueFalse, fillBlank, shortAnswer], target);
  }

  if (mode === "DEEP_DIVE") {
    if (composition === "DISCURSIVE_ONLY") {
      return createStructuredQuestionSet(selected, [discursive, shortAnswer], target);
    }

    return createStructuredQuestionSet(selected, [multipleChoice, discursive, shortAnswer], target);
  }

  if (mode === "EXAM") {
    if (composition === "DISCURSIVE_ONLY") {
      return createStructuredQuestionSet(selected, [shortAnswer, discursive], target);
    }

    return createStructuredQuestionSet(selected, [multipleChoice, multipleChoice, shortAnswer, discursive, trueFalse], target);
  }

  return createStructuredQuestionSet(selected, [shortAnswer], target);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildQuestionCandidates(analysis: DocumentAnalysis, mode: QuizMode) {
  const questions: Array<GeneratedQuestionCandidate | null> = [];
  const directUnits = selectUnitsByKinds(
    analysis.units,
    ["definition", "purpose", "rule", "procedure", "formula", "comparison", "list"],
    18,
  );

  if (mode === "QUICK_REVIEW") {
    const units = selectUnitsByKinds(analysis.units, ["definition", "purpose", "formula", "procedure", "list", "comparison"], 10);
    units.forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit, buildQuickReviewPrompt));
    });
  }

  if (mode === "DEEP_DIVE") {
    directUnits.slice(0, 10).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit, buildDirectPrompt));
    });
    directUnits.slice(0, 5).forEach((unit) => {
      questions.push(createMultipleChoiceQuestion(unit, analysis.units));
    });
  }

  if (mode === "EXAM") {
    directUnits.slice(0, 8).forEach((unit) => {
      questions.push(createMultipleChoiceQuestion(unit, analysis.units));
    });
    directUnits.slice(0, 8).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit, buildDirectPrompt));
    });
    directUnits.slice(0, 6).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit, buildQuickReviewPrompt));
    });
  }

  if (mode === "FEYNMAN") {
    selectUnitsByKinds(analysis.units, ["definition", "purpose", "procedure", "comparison", "rule"], 8).forEach(
      (unit) => {
        questions.push(createShortAnswerQuestion(unit, buildFeynmanPrompt));
      },
    );
  }

  if (mode === "FLASHCARDS") {
    directUnits.slice(0, 20).forEach((unit) => {
      questions.push(createFlashcardQuestion(unit));
    });
  }

  return questions;
}

function getTargetQuestionCount(mode: QuizMode) {
  return targetQuestionCounts[mode];
}

function getQuizModeTitle(mode: QuizMode) {
  switch (mode) {
    case "QUICK_REVIEW":
      return "Revisao rapida";
    case "DEEP_DIVE":
      return "Questionario profundo";
    case "EXAM":
      return "Modo prova";
    case "FEYNMAN":
      return "Modo Feynman";
    case "FLASHCARDS":
      return "Flashcards";
  }
}

function finalizeGeneratedQuestions(
  analysis: DocumentAnalysis,
  mode: QuizMode,
  composition: QuizComposition = resolveCompositionForMode(mode),
) {
  if (analysis.structuredQuestions.length >= MINIMUM_STRUCTURED_QUESTION_PAIRS) {
    const resolvedComposition = resolveCompositionForMode(mode, composition);
    const questions = uniqueStructuredQuestions(
      buildStructuredQuestionCandidates(analysis.structuredQuestions, mode, resolvedComposition),
    );
    const target = getTargetQuestionCount(mode);

    return {
      questions: questions.slice(0, target),
      generationNote:
        questions.length < target
          ? `Este material importou ${questions.length} ${questions.length === 1 ? "pergunta util" : "perguntas uteis"} neste modo. Mantivemos somente as perguntas com resposta confiavel do arquivo.`
          : undefined,
    };
  }

  return {
    questions: [],
    generationNote: undefined,
  };
}

class MockQuizGenerator implements QuizGenerator {
  generateQuizOptions(document: Document): QuizModeOption[] {
    const analysis = analyzeDocument(document);
    const previewCache = new Map<string, QuestionDraft[]>();
    const getPreview = (mode: QuizMode, composition: QuizComposition) => {
      const key = `${mode}:${composition}`;
      const cached = previewCache.get(key);
      if (cached) {
        return cached;
      }

      const preview = finalizeGeneratedQuestions(analysis, mode, composition).questions;
      previewCache.set(key, preview);
      return preview;
    };

    const buildCompositionOptions = (mode: QuizMode): QuizCompositionOption[] =>
      getAllowedCompositions(mode).map((composition) => {
        const preview = getPreview(mode, composition);

        return {
          composition,
          label: compositionLabels[composition],
          description: buildCompositionDescription(mode, composition),
          questionCount: preview.length,
          questionTypes: [...new Set(preview.map((question) => question.type))],
          locked: getAllowedCompositions(mode).length === 1,
        };
      });

    const options: QuizModeOption[] = [
      {
        mode: "QUICK_REVIEW",
        title: "Revisao rapida",
        tagline: "Objetiva, direta e variada",
        description: "Pode combinar multipla escolha, verdadeiro ou falso, lacunas e respostas curtas.",
        questionCount: getPreview("QUICK_REVIEW", "AUTO").length,
        questionTypes: [...new Set(getPreview("QUICK_REVIEW", "AUTO").map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
        compositionOptions: buildCompositionOptions("QUICK_REVIEW"),
      },
      {
        mode: "DEEP_DIVE",
        title: "Questionario profundo",
        tagline: "Explica, compara e aplica",
        description: "Mistura objetivas e discursivas para cobrar entendimento mais completo.",
        questionCount: getPreview("DEEP_DIVE", "AUTO").length,
        questionTypes: [...new Set(getPreview("DEEP_DIVE", "AUTO").map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
        compositionOptions: buildCompositionOptions("DEEP_DIVE"),
      },
      {
        mode: "EXAM",
        title: "Modo prova",
        tagline: "Resultado no final da rodada",
        description: "Mantem a pressao de prova, mas com composicao configuravel.",
        questionCount: getPreview("EXAM", "AUTO").length,
        questionTypes: [...new Set(getPreview("EXAM", "AUTO").map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: false,
        compositionOptions: buildCompositionOptions("EXAM"),
      },
      {
        mode: "FEYNMAN",
        title: "Modo Feynman",
        tagline: "Explique para consolidar",
        description: "Fica sempre discursivo, com foco em ensinar a ideia de forma simples.",
        questionCount: getPreview("FEYNMAN", "DISCURSIVE_ONLY").length,
        questionTypes: [...new Set(getPreview("FEYNMAN", "DISCURSIVE_ONLY").map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
        compositionOptions: buildCompositionOptions("FEYNMAN"),
      },
      {
        mode: "FLASHCARDS",
        title: "Flashcards",
        tagline: "Frente curta, verso completo",
        description: "Mantem o formato fixo de cards para memoria ativa.",
        questionCount: getPreview("FLASHCARDS", "AUTO").length,
        questionTypes: [...new Set(getPreview("FLASHCARDS", "AUTO").map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
        compositionOptions: buildCompositionOptions("FLASHCARDS"),
      },
    ];

    return options.filter((option) => option.questionCount > 0);
  }

  generateQuizFromDocument(document: Document, mode: QuizMode, composition?: QuizComposition): GeneratedQuiz {
    const analysis = analyzeDocument(document);
    const resolvedComposition = resolveCompositionForMode(mode, composition);
    const generated = finalizeGeneratedQuestions(analysis, mode, resolvedComposition);

    return {
      title: `${document.title} - ${getQuizModeTitle(mode)}`,
      mode,
      composition: resolvedComposition,
      questions: generated.questions.map((question, index) => ({
        ...question,
        topic: question.topic || `Topico ${index + 1}`,
      })),
    };
  }
}

const generator = new MockQuizGenerator();

export function generateQuizOptions(document: Document) {
  return generator.generateQuizOptions(document);
}

export function generateQuizFromDocument(document: Document, mode: QuizMode, composition?: QuizComposition) {
  return generator.generateQuizFromDocument(document, mode, composition);
}

export function getMinimumQuestionTarget(mode: QuizMode) {
  return getTargetQuestionCount(mode);
}






