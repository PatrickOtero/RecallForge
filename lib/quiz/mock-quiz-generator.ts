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
  extractConceptTokens,
  extractReferenceKeywords,
  uniqueConceptTokens,
} from "@/lib/quiz/concept-utils";
import type { GeneratedQuiz, QuizGenerator } from "@/lib/quiz/generator-interface";
import { computeStudyBankCapabilities, parseMatchingQuestionDrafts, type StudyBankCapabilities } from "@/lib/quiz-parser";
import { buildQuizSessionTitle } from "@/lib/quiz-session/build-session";
import { getAvailableModes, getModeQuestionTypes, isQuestionCompatibleWithMode } from "@/lib/quiz-session/mode-compatibility";
import {
  getUnavailableModeMessage as getConfiguredUnavailableModeMessage,
  studyModeConfigs,
} from "@/lib/quiz-session/mode-config";
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
  structuredDrafts: QuestionDraft[];
  units: KnowledgeUnit[];
  structuredQuestions: ParsedStructuredQuestion[];
  capabilities: StudyBankCapabilities;
}

interface GeneratedQuestionCandidate {
  question: QuestionDraft;
  unit: KnowledgeUnit;
}

type StructuredPromptStyle = "QUESTION" | "TRUE_FALSE" | "ASSOCIATION" | "FLASHCARD";

type StructuredSectionKind = "DEFAULT" | "ASSOCIATION";

type StructuredQuestionAnswerKind =
  | "definition"
  | "reason"
  | "procedure"
  | "formula"
  | "list"
  | "association"
  | "true_false"
  | "numeric_case"
  | "rule";

export interface ParsedStructuredQuestion {
  prompt: string;
  expectedAnswer: string;
  referenceExcerpt: string;
  topic: string;
  type: "SHORT_ANSWER";
  sectionTitle: string;
  sectionIndex: number;
  promptStyle: StructuredPromptStyle;
  answerKind: StructuredQuestionAnswerKind;
  associationGroup?: string;
  associationItem?: string;
}

interface StructuredDistractorCandidate {
  expectedAnswer: string;
  score: number;
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
  DEEP_DIVE: 10,
  EXAM: 10,
  FEYNMAN: 10,
  FLASHCARDS: 8,
};

const compositionLabels: Record<QuizComposition, string> = {
  AUTO: "Revisão geral",
  MULTIPLE_CHOICE_ONLY: "Múltipla escolha",
  DISCURSIVE_ONLY: "Revelar resposta",
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
const brokenSymbolMatcher = /(?:\u00e2\u02c6\u0192|\u00e2\u2030\u00a1|\u00ef\u00bf\u00be)/u;
const separatorLineMatcher = /^[-_=]{6,}$/;
const structuredSectionMatcher =
  /^(?:#{1,6}\s+(.+?)\s*|={3,}\s*(.+?)\s*={3,}|\[\s*(.+?)\s*\]|(?:bloco|modulo|m[o\u00f3]dulo|tema|cap[i\u00ed]tulo|sec[a\u00e3]o|se[c\u00e7][a\u00e3]o|aula)\s*\d*\s*[-:\u2013\u2014]?\s+(.+))$/iu;
const structuredAnswerMatcher =
  /^(?:(?:resposta|resposta esperada|gabarito|answer|a|r)\s*[:\-??]\s*)(.*)$/i;
const structuredQuestionLeadMatcher =
  /^(?:\d+[\).]\s*)?(?:(?:pergunta|q|p)\s*[:\-??]\s*|qual|quais|o que|que|como|quando|onde|por que|porque|quem|explique|cite|defina|associe|relacione|complete|verdadeiro ou falso|flashcards?)\b/i;
const structuredAssociationInstructionMatcher =
  /^(?:quest[o�]es? de associa[c�][a�]o|associe(?: cada item)?(?: [a�] resposta correta)?|associa[c�][a�]o)\b/i;
const metaInstructionMatcher =
  /^(?:use da seguinte forma|instru[c�][o�]es? de uso|como usar|tente responder sem olhar|confira o gabarito|refa[c�]a as perguntas erradas|reveja as perguntas erradas)\b/i;
const blockedGeneratedPromptMatcher =
  /^(?:resuma em uma frase o conceito de (?:qual|quais)\b|explique (?:qual|quais)\b|use da seguinte forma\b)/i;
const invalidTopicStartMatcher =
  /^(?:o ajuste deve|sabemos tamb[e�]m|todos os|toda a|use|excel|top|campo de altera[c�][a�]o|ap[o�]s t[e�]rmino)/i;
const invalidTopicContentMatcher =
  /(?:c[o�]pia autorizada|excel top 30|campo de altera[c�][a�]o|acesso:|>>|tela de acesso|tela de altera[c�][a�]o)/i;
const formulaOnlyTopicMatcher = /^[\p{L}\d\s]+(?:[+*/-][\p{L}\d\s]+)+$/u;
const noisyAnswerMatcher =
  /(?:c[o�]pia autorizada|acesso:|>>|campo de altera[c�][a�]o|excel top 30|tela de acesso|tela de altera[c�][a�]o)/i;
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
    .replace(/\u00ce\u039e|\u00ef\u00bf\u00be|���|���S/g, " ")
    .replace(/\bN\s+O(?=\s+\p{L}{3,})/gu, "N\u00c3O")
    .replace(/\bpar metros\b/gi, "par\u00e2metros")
    .replace(/\bsistematica\b/gi, "sistem\u00e1tica")
    .replace(/\s*={3,}\s*/g, " ")
    .replace(/\s*[-��]{3,}\s*/g, " ")
    .replace(/\bcomo por exemplo:\s*/gi, "como ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function containsBrokenGeneratedText(text: string) {
  const normalized = normalizeForComparison(text);
  const hasMojibake = /[\u00c3\u00c2][\u0080-\u00bf]|\u00e2[\u0080-\u20ff]/u.test(text);

  return (
    /�}~|￾|��|��a|�|====/i.test(text) ||
    /\bN O\b/.test(text) ||
    /\bpar metros\b/i.test(text) ||
    /C[o�]pia autorizada|KEVIN SILVA|N[a�]o pode ser distribu[i�]do|Acesso:|>>|Campo de altera[c�][a�]o|Ap[o�]s t[e�]rmino, exportar RMS/i.test(
      text,
    ) ||
    normalized.includes("copia autorizada") ||
    normalized.includes("kevin silva") ||
    normalized.includes("nao pode ser distribuido") ||
    normalized.includes("campo de alteracao") ||
    hasMojibake
  );
}

function sanitizeGeneratedTextStrict(text: string) {
  return sanitizeGeneratedText(text)
    .replace(/\r/g, "\n")
    .replace(/\u00ce\u017e|\u00ce\u039e|\u00ef\u00bf\u00be|\u00ef\u0083\u0098|\u00e2\u0096\u00aa|�0�/g, " ")
    .replace(/\b(?:copia autorizada|c[o�]pia autorizada)\b[^\n]*/gi, " ")
    .replace(/\bKEVIN SILVA\b/gi, " ")
    .replace(/\bN[a�]o pode ser distribu[i�]do\b[^\n]*/gi, " ")
    .replace(/\bAcesso:\b[^\n]*/gi, " ")
    .replace(/\bCampo de altera[c�][a�]o\b[^\n]*/gi, " ")
    .replace(/\bAp[o�]s t[e�]rmino,\s*exportar RMS\b[^\n]*/gi, " ")
    .replace(/\bExcel Top 30\b[^\n]*/gi, " ")
    .replace(/\bN\s+O(?=\s+\p{L}{3,})/gu, "NAO")
    .replace(/\bpar metros\b/gi, "parametros")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedRawArtifact(text: string) {
  const normalized = normalizeForComparison(text);

  return (
    /�}~|�0�|￾|��|��a|�|====/i.test(text) ||
    /\bN O\b/.test(text) ||
    /\bpar metros\b/i.test(text) ||
    /C[o�]pia autorizada|KEVIN SILVA|N[a�]o pode ser distribu[i�]do|Acesso:|>>|Campo de altera[c�][a�]o|Ap[o�]s t[e�]rmino, exportar RMS|Excel Top 30/i.test(
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
    correctAnswer:
      question.type === "TRUE_FALSE"
        ? question.correctAnswer
        : question.correctAnswer
          ? sanitizeAnswerText(question.correctAnswer)
          : question.correctAnswer,
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
    /\b(nunca devemos|nao deve|n�o deve|deve|devem)\b/i.test(normalized) ||
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

function looksLikeListAnswer(value: string) {
  const cleaned = ensureSentence(value);
  const normalized = normalizeForComparison(cleaned);

  return (
    /[;:]/.test(cleaned) ||
    (cleaned.includes(",") && countWords(cleaned) >= 8) ||
    /\b(lista|itens|etapas|partes|tipos|componentes|fatores)\b/i.test(normalized)
  );
}

function hasProcedureLanguage(value: string) {
  return /\b(deve|devem|precisa|precisam|primeiro|depois|antes|apos|seguir|executar|realizar|conferir)\b/i.test(
    normalizeForComparison(value),
  );
}

function hasRuleLanguage(value: string) {
  return /\b(deve|devem|obrigatorio|proibido|nunca|somente|apenas|permitido)\b/i.test(
    normalizeForComparison(value),
  );
}

function isReasonStyleAnswer(value: string) {
  return /^(porque|pois|devido a|uma vez que|ja que)\b/i.test(normalizeForComparison(value));
}

function isDefinitionLikeStructuredAnswer(value: string) {
  return /^e\s+(?:a|o|um|uma)\b/i.test(normalizeForComparison(value)) || /\b(significa|corresponde a|refere se a|consiste em)\b/i.test(normalizeForComparison(value));
}

function classifyQuestionAnswer(prompt: string, answer: string): StructuredQuestionAnswerKind {
  const normalizedPrompt = normalizeForComparison(prompt);

  if (/verdadeiro ou falso/.test(normalizedPrompt)) {
    return "true_false";
  }

  if (/associe|relacione|\best[aá]?\s+associad/.test(normalizedPrompt)) {
    return "association";
  }

  if (/^por que\b|^porque\b/.test(normalizedPrompt) || isReasonStyleAnswer(answer)) {
    return "reason";
  }

  if (/=/.test(answer) || /\bformula|indice|calculo\b/i.test(normalizedPrompt)) {
    return "formula";
  }

  if (
    /\b\d+(?:[.,]\d+)?%?\b/.test(answer) &&
    /\b(quanto|valor|resultado|faixa|percentual|cobertura|dias)\b/i.test(normalizedPrompt)
  ) {
    return "numeric_case";
  }

  if (/^(como|quais sao as etapas|quais sao os passos)\b/.test(normalizedPrompt) || hasProcedureLanguage(answer)) {
    return "procedure";
  }

  if (hasRuleLanguage(answer) && !/^como\b/.test(normalizedPrompt)) {
    return "rule";
  }

  if (/^(quais|cite|liste|enumere)\b/.test(normalizedPrompt) || looksLikeListAnswer(answer)) {
    return "list";
  }

  if (/^(o que e|o que sao|quem e|qual e)\b/.test(normalizedPrompt) || isDefinitionLikeStructuredAnswer(answer)) {
    return "definition";
  }

  if (/\b\d+(?:[.,]\d+)?%?\b/.test(answer)) {
    return "numeric_case";
  }

  return "procedure";
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
  return trimOuterPunctuation(title.replace(/^\d+(\.\d+)*\s*[-��.:]?\s*/, ""));
}

function getPreferredTopicFromSection(section: TextSection) {
  const cleanedTitle = titleCase(cleanSectionTitle(section.title));
  return isUsefulTopic(cleanedTitle) ? cleanedTitle : null;
}

function sanitizeStructuredLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function stripQuestionnaireLabel(value: string) {
  return value
    .replace(
      /^(?:p|r|q|a|pergunta|resposta|resposta esperada|gabarito|enunciado|quest[aã]o|frente|verso|termo|defini[cç][aã]o)\s*(?::|\.|-)\s*/iu,
      "",
    )
    .trim();
}

function isSeparatorLine(value: string) {
  return separatorLineMatcher.test(value);
}

function isMetaInstructionLine(value: string) {
  return metaInstructionMatcher.test(normalizeForComparison(value));
}

function hasExplicitStructuredPromptPrefix(value: string) {
  return /^(?:pergunta|q|p)\s*[:\-��]\s*/i.test(value);
}

function stripStructuredQuestionPrefix(value: string) {
  return value.replace(/^(?:\d+[\).]\s*|(?:pergunta|q|p)\s*[:\-��]\s*)/i, "").trim();
}

function detectStructuredPromptStyle(value: string): StructuredPromptStyle {
  const normalized = normalizeForComparison(value);

  if (
    normalized.startsWith("verdadeiro ou falso") ||
    normalized.startsWith("certo ou errado") ||
    normalized.startsWith("v f") ||
    normalized.startsWith("c e")
  ) {
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
  const raw = trimOuterPunctuation(matched?.slice(1).find(Boolean) ?? value).replace(/^\[\s*|\s*\]$/g, "");
  if (!raw) {
    return "Questionário importado";
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
  return value.replace(/^[-*"]\s*/, "").trim();
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
  if (sectionTitle && sectionTitle !== "Questionário importado" && isUsefulTopic(sectionTitle)) {
    return sectionTitle;
  }

  const keywords = extractReferenceKeywords(`${prompt} ${answer}`, 4).filter(
    (keyword) => !/^(qual|quais|que|como|onde|quando|porque|por)$/.test(keyword),
  );

  if (keywords.length === 0) {
    return "Questões importadas";
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
    answerKind: isAssociation ? "association" : classifyQuestionAnswer(prompt, expectedAnswer),
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
  let sectionTitle = "Questionário importado";
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
      if (normalizeForComparison(sectionTitle) === normalizeForComparison("Questionário importado")) {
        sectionTitle = "Questões de associação";
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
        promptStyle: sectionKind === "ASSOCIATION" ? "ASSOCIATION" : detectStructuredPromptStyle(stripStructuredQuestionPrefix(line)),
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

function buildDraftId(prefix: string, sourceIndex: number, text: string) {
  return `${prefix}-${sourceIndex}-${normalizeForComparison(text).slice(0, 48)}`;
}

function cleanQuestionLine(value: string) {
  return stripQuestionnaireLabel(value)
    .replace(/^(?:\d+[\).]\s*|quest[aã]o\s*\d+\s*[:.-]?\s*)/iu, "")
    .trim();
}

function parseBooleanAnswer(value: string) {
  const normalized = normalizeForComparison(value);

  if (/^(v|verdadeiro|c|certo|sim)\b/.test(normalized)) {
    return true;
  }

  if (/^(f|falso|e|errado|nao)\b/.test(normalized)) {
    return false;
  }

  return null;
}

function isTrueFalseInstructionLine(value: string) {
  return /^(?:verdadeiro ou falso|certo ou errado|v\s*f|c\s*e)\s*[:?]?$/i.test(normalizeForComparison(value));
}

function stripTrueFalsePromptPrefix(value: string) {
  return cleanQuestionLine(value)
    .replace(/^(?:verdadeiro ou falso|certo ou errado|v\s*\/?\s*f|c\s*\/?\s*e)\s*[:?-]\s*/iu, "")
    .replace(/\s+(?:certo ou errado|verdadeiro ou falso)\?\s*$/iu, "")
    .trim();
}

function hasTrueFalseStatementVerb(value: string) {
  const normalized = normalizeForComparison(value);

  return /\b(?:e|eh|sao|significa|corresponde|consiste|refere|serve|permite|visa|ajuda|mede|mostra|indica|representa|gera|resulta|afeta|calcula|deve|devem|consegue|protege|confronta|ignora|possui|tem|fica|esta|ocorre|usa|utiliza|produz|apresenta|inclui|exige|depende|reduz|aumenta|mantem|define|forma|pertence|localiza|compara|envolve|recebe|contem|abrange|caracteriza)\b/i.test(
    normalized,
  );
}

function isCompleteTrueFalseStatement(value: string) {
  const cleaned = trimOuterPunctuation(stripTrueFalsePromptPrefix(value));
  const normalized = normalizeForComparison(cleaned);

  if (!cleaned || cleaned.length < 18 || countWords(cleaned) < 5) {
    return false;
  }

  if (/[?]$/.test(cleaned) || /^(?:qual|quais|que|o que|como|quando|onde|por que|porque|quem)\b/i.test(normalized)) {
    return false;
  }

  if (!hasTrueFalseStatementVerb(cleaned)) {
    return false;
  }

  return true;
}

function parseReadyMultipleChoiceDrafts(text: string) {
  const lines = text.split(/\r?\n/).map(sanitizeStructuredLine);
  const drafts: QuestionDraft[] = [];
  let sectionTitle = "Questionário importado";
  let sectionIndex = 0;
  let pendingPrompt = "";
  let current:
    | {
        prompt: string;
        sectionTitle: string;
        sectionIndex: number;
        sourceIndex: number;
        options: Array<{ id: string; letter: string; text: string; isCorrect: boolean }>;
        correctLetter?: string;
      }
    | null = null;

  function finishCurrent() {
    if (!current) {
      return;
    }

    const correct = current.options.find(
      (option) => option.isCorrect || option.letter.toLowerCase() === current?.correctLetter?.toLowerCase(),
    );
    if (current.prompt && current.options.length >= 2 && correct) {
      drafts.push({
        type: "MULTIPLE_CHOICE",
        prompt: current.prompt,
        topic: current.sectionTitle,
        choices: current.options.map((option) => ({ id: option.id, label: option.text })),
        correctAnswer: correct.text,
        explanation: correct.text,
      });
    }

    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || isSeparatorLine(line)) {
      finishCurrent();
      continue;
    }

    if (isStructuredSectionTitle(line)) {
      finishCurrent();
      sectionTitle = normalizeStructuredSectionTitle(line);
      sectionIndex += 1;
      pendingPrompt = "";
      continue;
    }

    const optionMatch = line.match(/^([A-Ha-h])[\).]\s+(.{1,400})$/);
    const checkedMatch = line.match(/^\(\s*([xX]?)\s*\)\s+(.{1,400})$/);
    if (optionMatch || checkedMatch) {
      if (!current) {
        const prompt = cleanQuestionLine(pendingPrompt);
        current = {
          prompt,
          sectionTitle,
          sectionIndex,
          sourceIndex: index,
          options: [],
        };
      }

      const letter = optionMatch?.[1] ?? String.fromCharCode(65 + current.options.length);
      const optionText = trimOuterPunctuation(optionMatch?.[2] ?? checkedMatch?.[2] ?? "");
      current.options.push({
        id: `${buildDraftId("choice", index, optionText)}-${letter.toLowerCase()}`,
        letter,
        text: ensureSentence(optionText),
        isCorrect: Boolean(checkedMatch?.[1]),
      });
      continue;
    }

    const answerMatch = line.match(/^(?:gabarito|resposta correta|resposta)\s*[:\-]\s*([A-Ha-h])\b/iu);
    if (answerMatch && current) {
      current.correctLetter = answerMatch[1];
      finishCurrent();
      pendingPrompt = "";
      continue;
    }

    if (!current && !/^(?:quest[aã]o\s*\d+|gabarito|resposta correta)\b/iu.test(normalizeForComparison(line))) {
      pendingPrompt = line;
    }
  }

  finishCurrent();
  return drafts;
}

function parseReadyTrueFalseDrafts(text: string) {
  const lines = text.split(/\r?\n/).map(sanitizeStructuredLine);
  const drafts: QuestionDraft[] = [];
  let sectionTitle = "Questionário importado";
  let sectionIndex = 0;

  function add(statement: string, answer: boolean, sourceIndex: number) {
    const cleanStatement = ensureSentence(stripTrueFalsePromptPrefix(statement.replace(/\((?:v|f|c|e)\)\s*$/iu, "")));
    if (!isCompleteTrueFalseStatement(cleanStatement)) {
      return;
    }

    drafts.push({
      type: "TRUE_FALSE",
      prompt: cleanStatement,
      topic: sectionTitle,
      correctAnswer: answer ? "true" : "false",
      explanation: answer ? "Verdadeiro" : "Falso",
    });
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || isSeparatorLine(line)) {
      continue;
    }

    if (isStructuredSectionTitle(line)) {
      sectionTitle = normalizeStructuredSectionTitle(line);
      sectionIndex += 1;
      continue;
    }

    const inlineMark = line.match(/^(.{8,400}?)\s*\((v|f|c|e)\)\s*$/iu);
    if (inlineMark) {
      const answer = parseBooleanAnswer(inlineMark[2]);
      if (answer !== null) {
        add(inlineMark[1], answer, index);
      }
      continue;
    }

    const inlineAnswer = line.match(/^(.{8,400}?)\s+(?:resposta|gabarito)\s*[:\-]\s*(verdadeiro|falso|certo|errado|v|f|c|e)\.?$/iu);
    if (inlineAnswer) {
      const answer = parseBooleanAnswer(inlineAnswer[2]);
      if (answer !== null) {
        add(inlineAnswer[1], answer, index);
      }
      continue;
    }

    if (isTrueFalseInstructionLine(line)) {
      const statement = lines[index + 1] ?? "";
      const answerLine = lines[index + 2] ?? "";
      const answerMatch = answerLine.match(/^(?:resposta|gabarito)\s*[:\-]\s*(.+)$/iu);
      const answer = answerMatch ? parseBooleanAnswer(answerMatch[1]) : null;
      if (answer !== null) {
        add(statement, answer, index);
        index += 2;
      }
      continue;
    }

    const questionAnswer = line.match(/^(.{8,400}?)\s+(?:certo ou errado|verdadeiro ou falso)\?\s*$/iu);
    const nextAnswer = lines[index + 1]?.match(/^(?:resposta|gabarito)\s*[:\-]\s*(.+)$/iu);
    if (questionAnswer && nextAnswer) {
      const answer = parseBooleanAnswer(nextAnswer[1]);
      if (answer !== null) {
        add(questionAnswer[1], answer, index);
        index += 1;
      }
      continue;
    }

    if (nextAnswer && isCompleteTrueFalseStatement(line)) {
      const answer = parseBooleanAnswer(nextAnswer[1]);
      if (answer !== null) {
        add(line, answer, index);
        index += 1;
      }
    }
  }

  return drafts;
}

function buildTrueFalseDraftsFromStructured(questions: ParsedStructuredQuestion[]): QuestionDraft[] {
  const drafts: QuestionDraft[] = [];

  for (const question of questions) {
    if (question.promptStyle !== "TRUE_FALSE") {
      continue;
    }

    const answer = parseBooleanAnswer(question.expectedAnswer);
    const statement = stripTrueFalsePromptPrefix(question.prompt);
    if (answer === null || !isCompleteTrueFalseStatement(statement)) {
      continue;
    }

    drafts.push({
      type: "TRUE_FALSE",
      prompt: ensureSentence(statement),
      topic: question.topic,
      correctAnswer: answer ? "true" : "false",
      explanation: answer ? "Verdadeiro" : "Falso",
      referenceAnswer: question.referenceExcerpt,
    });
  }

  return drafts;
}

function parseReadyFlashcardDrafts(text: string) {
  const lines = text.split(/\r?\n/).map(sanitizeStructuredLine);
  const drafts: QuestionDraft[] = [];
  let sectionTitle = "Questionário importado";
  let sectionIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || isSeparatorLine(line)) {
      continue;
    }

    if (isStructuredSectionTitle(line)) {
      sectionTitle = normalizeStructuredSectionTitle(line);
      sectionIndex += 1;
      continue;
    }

    const frontMatch = line.match(/^(?:frente|termo)\s*[:\-]\s*(.*)$/iu);
    if (!frontMatch) {
      continue;
    }

    const front = frontMatch[1] || lines[index + 1] || "";
    const versoLineIndex = frontMatch[1] ? index + 1 : index + 2;
    const backMatch = lines[versoLineIndex]?.match(/^(?:verso|defini[cç][aã]o)\s*[:\-]\s*(.*)$/iu);
    if (!backMatch) {
      continue;
    }

    const back = backMatch[1] || lines[versoLineIndex + 1] || "";
    if (!front.trim() || !back.trim()) {
      continue;
    }

    drafts.push({
      type: "FLASHCARD",
      prompt: trimOuterPunctuation(front),
      topic: sectionTitle,
      correctAnswer: ensureSentence(back),
      referenceAnswer: ensureSentence(back),
    });
  }

  return drafts;
}

function parseColumnMatchingDrafts(text: string) {
  const lines = text.split(/\r?\n/).map(sanitizeStructuredLine);
  const drafts: QuestionDraft[] = [];
  let sectionTitle = "Questionário importado";
  let sectionIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isStructuredSectionTitle(line)) {
      sectionTitle = normalizeStructuredSectionTitle(line);
      sectionIndex += 1;
      continue;
    }

    if (!/^associe\b/iu.test(normalizeForComparison(line))) {
      continue;
    }

    const left = new Map<string, string>();
    const right = new Map<string, string>();
    const keys: Array<[string, string]> = [];
    let mode: "left" | "right" | "key" | null = null;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];
      if (!current || isSeparatorLine(current)) {
        continue;
      }

      const normalized = normalizeForComparison(current);
      if (/^coluna a\b/.test(normalized)) {
        mode = "left";
        continue;
      }

      if (/^coluna b\b/.test(normalized)) {
        mode = "right";
        continue;
      }

      if (/^gabarito\b/.test(normalized)) {
        mode = "key";
        const inlineKeys = current.matchAll(/([A-Z])\s*[-–]\s*(\d+)/giu);
        for (const match of inlineKeys) {
          keys.push([match[1].toUpperCase(), match[2]]);
        }
        continue;
      }

      if (mode === "left") {
        const match = current.match(/^([A-Z])[\).]\s+(.+)$/iu);
        if (match) {
          left.set(match[1].toUpperCase(), trimOuterPunctuation(match[2]));
          continue;
        }
      }

      if (mode === "right") {
        const match = current.match(/^(\d+)[\).]\s+(.+)$/iu);
        if (match) {
          right.set(match[1], ensureSentence(match[2]));
          continue;
        }
      }

      if (mode === "key") {
        const keyMatches = current.matchAll(/([A-Z])\s*[-–]\s*(\d+)/giu);
        for (const match of keyMatches) {
          keys.push([match[1].toUpperCase(), match[2]]);
        }

        if (keys.length > 0 && (!lines[cursor + 1] || isStructuredSectionTitle(lines[cursor + 1]))) {
          index = cursor;
          break;
        }
      }
    }

    const pairs = keys
      .map(([leftKey, rightKey], pairIndex) => {
        const leftValue = left.get(leftKey);
        const rightValue = right.get(rightKey);
        return leftValue && rightValue
          ? { id: buildDraftId("match", pairIndex, `${leftValue} ${rightValue}`), left: leftValue, right: rightValue }
          : null;
      })
      .filter((pair): pair is { id: string; left: string; right: string } => Boolean(pair));

    if (pairs.length >= 2) {
      drafts.push({
        type: "MATCHING",
        prompt: "Associe cada item à descrição correta.",
        topic: sectionTitle,
        matchingPairs: pairs,
        explanation: pairs.map((pair) => `${pair.left}: ${pair.right}`).join(" "),
      });
    }
  }

  return drafts;
}

function buildAssociationDraftsFromStructured(questions: ParsedStructuredQuestion[]): QuestionDraft[] {
  const groups = new Map<string, ParsedStructuredQuestion[]>();

  for (const question of questions) {
    if (question.promptStyle !== "ASSOCIATION") {
      continue;
    }

    const key = question.associationGroup ?? `${question.sectionIndex}:${normalizeForComparison(question.sectionTitle)}`;
    const group = groups.get(key) ?? [];
    group.push(question);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .map((group) => ({
      type: "MATCHING",
      prompt: "Associe cada item à descrição correta.",
      topic: group[0]?.sectionTitle ?? "Associação",
      matchingPairs: group.map((question, index) => ({
        id: buildDraftId("match", index, `${question.prompt} ${question.expectedAnswer}`),
        left: question.associationItem ?? question.prompt,
        right: question.expectedAnswer,
      })),
      explanation: group.map((question) => `${question.prompt}: ${question.expectedAnswer}`).join(" "),
    }) satisfies QuestionDraft);
}

function parseAnswerKeyAtEndDrafts(text: string): QuestionDraft[] {
  const parts = text.split(/\bGabarito\s*:/iu);
  if (parts.length < 2) {
    return [];
  }

  const questionLines = parts[0]
    .split(/\r?\n/)
    .map(sanitizeStructuredLine)
    .filter((line) => /^\d+[\).]\s+/.test(line));
  const answerLines = parts
    .slice(1)
    .join("\n")
    .split(/\r?\n/)
    .map(sanitizeStructuredLine)
    .filter((line) => /^\d+[\).]\s+/.test(line));

  if (questionLines.length < 2 || answerLines.length < 2) {
    return [];
  }

  const answers = new Map(
    answerLines.map((line) => {
      const match = line.match(/^(\d+)[\).]\s+(.+)$/);
      return [match?.[1] ?? "", ensureSentence(match?.[2] ?? "")] as const;
    }),
  );

  const drafts: QuestionDraft[] = [];

  for (const line of questionLines) {
    const match = line.match(/^(\d+)[\).]\s+(.+)$/);
    const answer = match ? answers.get(match[1]) : "";
    if (!match || !answer) {
      continue;
    }

    drafts.push({
      type: "REVEAL_ANSWER",
      prompt: trimOuterPunctuation(match[2]),
      topic: "Gabarito",
      correctAnswer: answer,
      referenceAnswer: answer,
    });
  }

  return drafts;
}

function validateReadyDraft(question: QuestionDraft) {
  if (!question.prompt || containsBrokenGeneratedText(question.prompt)) {
    return false;
  }

  if (question.type === "MULTIPLE_CHOICE") {
    const choices = question.choices ?? [];
    return choices.length >= 2 && Boolean(question.correctAnswer) && choices.some((choice) => choice.label === question.correctAnswer);
  }

  if (question.type === "TRUE_FALSE") {
    return (
      (question.correctAnswer === "true" || question.correctAnswer === "false") &&
      isCompleteTrueFalseStatement(question.prompt)
    );
  }

  if (question.type === "MATCHING") {
    return (question.matchingPairs ?? []).length >= 2;
  }

  if (question.type === "FLASHCARD" || question.type === "REVEAL_ANSWER") {
    return Boolean(question.correctAnswer);
  }

  return false;
}

function dedupeQuestionDrafts(questions: QuestionDraft[]) {
  const seen = new Set<string>();
  const result: QuestionDraft[] = [];

  for (const question of questions) {
    const key = `${question.type}|${buildPromptSignature(question.prompt)}|${buildPromptSignature(question.correctAnswer ?? question.explanation ?? "")}`;
    if (seen.has(key) || !validateReadyDraft(question)) {
      continue;
    }

    seen.add(key);
    result.push(question);
  }

  return result;
}

function parseReadyQuestionDrafts(text: string, structuredQuestions: ParsedStructuredQuestion[]) {
  return dedupeQuestionDrafts([
    ...parseMatchingQuestionDrafts(text),
    ...parseReadyMultipleChoiceDrafts(text),
    ...parseColumnMatchingDrafts(text),
    ...buildAssociationDraftsFromStructured(structuredQuestions),
    ...parseReadyTrueFalseDrafts(text),
    ...buildTrueFalseDraftsFromStructured(structuredQuestions),
    ...parseReadyFlashcardDrafts(text),
    ...parseAnswerKeyAtEndDrafts(text),
  ]);
}

function isUsableStructuredQuestion(question: ParsedStructuredQuestion) {
  if (question.promptStyle !== "TRUE_FALSE") {
    return true;
  }

  return parseBooleanAnswer(question.expectedAnswer) !== null && isCompleteTrueFalseStatement(question.prompt);
}

export function detectStructuredQuestionnaire(text: string) {
  const structuredQuestions = parseStructuredQuestionnaire(text).filter(isUsableStructuredQuestion);
  const readyDrafts = parseReadyQuestionDrafts(text, structuredQuestions);
  const trueFalseCount = readyDrafts.filter((question) => question.type === "TRUE_FALSE").length;
  const flashcardCount = readyDrafts.filter((question) => question.type === "FLASHCARD").length;
  const revealAnswerCount = readyDrafts.filter((question) => question.type === "REVEAL_ANSWER").length;

  return (
    structuredQuestions.length >= MINIMUM_STRUCTURED_QUESTION_PAIRS ||
    readyDrafts.some((question) => question.type === "MULTIPLE_CHOICE" || question.type === "MATCHING") ||
    trueFalseCount >= 3 ||
    flashcardCount >= 3 ||
    revealAnswerCount >= 3
  );
}

function buildTopicFallback(section: TextSection, content: string) {
  const preferredTitle = getPreferredTopicFromSection(section);
  if (preferredTitle && preferredTitle !== "Visão geral") {
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
    return "O que deve acontecer apos a validacao das informacoes de estoque em um inventário?";
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
    return "Em qual horário as lojas podem alterar as quantidades sugeridas para carga seca e congelada?";
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
      prompt: "Quais são os motivos mais comuns?",
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
  const structuredQuestions = parseStructuredQuestionnaire(document.cleanedText).filter(isUsableStructuredQuestion);
  const structuredDrafts = parseReadyQuestionDrafts(document.cleanedText, structuredQuestions);
  const capabilities = computeStudyBankCapabilities(structuredDrafts);
  const sections = extractSections(document.cleanedText);
  const trueFalseCount = structuredDrafts.filter((question) => question.type === "TRUE_FALSE").length;
  const flashcardCount = structuredDrafts.filter((question) => question.type === "FLASHCARD").length;
  const revealAnswerCount = structuredDrafts.filter((question) => question.type === "REVEAL_ANSWER").length;
  const hasEnoughReadyQuestions =
    structuredDrafts.some((question) => question.type === "MULTIPLE_CHOICE" || question.type === "MATCHING") ||
    trueFalseCount >= 3 ||
    flashcardCount >= 3 ||
    revealAnswerCount >= 3;

  if (structuredQuestions.length >= MINIMUM_STRUCTURED_QUESTION_PAIRS || hasEnoughReadyQuestions) {
    return {
      sections,
      units: [],
      structuredDrafts,
      structuredQuestions,
      capabilities,
      emphasis: [
        ...new Set([
          ...structuredDrafts.map((question) => question.topic),
          ...structuredQuestions.map((question) => question.topic),
        ]),
      ].slice(0, 3),
    };
  }

  // Raw-text question generation was intentionally disabled after the product pivot.
  return {
    sections,
    units: [],
    structuredDrafts: [],
    structuredQuestions: [],
    capabilities,
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
  const source = sanitizeAnswerText(unit.referenceExcerpt ?? unit.expectedAnswer);
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
    return `O que é ${unit.topic}?`;
  }

  if (isPurposeStyleAnswer(unit.expectedAnswer)) {
    return `Para que serve ${unit.topic}?`;
  }

  return `Qual é a finalidade de ${unit.topic}?`;
}

function buildDirectPrompt(unit: KnowledgeUnit) {
  if (unit.shortAnswerPrompt) {
    return unit.shortAnswerPrompt;
  }

  switch (unit.kind) {
    case "definition":
      return `O que é ${unit.topic}?`;
    case "purpose":
      return buildPurposePrompt(unit);
    case "procedure":
      return `Quais são os principais procedimentos de ${unit.topic}?`;
    case "rule":
      return `Qual regra deve ser observada em ${unit.topic}?`;
    case "formula":
      return `Como é calculado ${unit.topic}?`;
    case "comparison":
      return `Qual é a diferença entre ${unit.topic}?`;
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
      return `O que é ${unit.topic}?`;
    case "purpose":
      return buildPurposePrompt(unit);
    case "procedure":
      return `Quais são os principais procedimentos de ${unit.topic}?`;
    case "rule":
      return `Qual regra deve ser observada em ${unit.topic}?`;
    case "formula":
      return `Como é calculado ${unit.topic}?`;
    case "comparison":
      return `Qual é a diferença entre ${unit.topic}?`;
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
      return `Qual alternativa descreve corretamente como ${unit.topic} é calculado?`;
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
  return `${item} está associado a qual resposta?`;
}

function createStructuredShortAnswerQuestion(
  question: ParsedStructuredQuestion,
  responseFormat: QuestionResponseFormat = "SHORT",
  prompt = question.promptStyle === "ASSOCIATION" ? buildAssociationPrompt(question) : question.prompt,
): QuestionDraft {
  return {
    type: "REVEAL_ANSWER",
    prompt,
    topic: question.topic,
    responseFormat,
    correctAnswer: question.expectedAnswer,
    referenceAnswer: question.referenceExcerpt,
    explanation: question.expectedAnswer,
  };
}

function createStructuredFeynmanQuestion(question: ParsedStructuredQuestion): QuestionDraft {
  const prompt = question.promptStyle === "ASSOCIATION" ? buildAssociationPrompt(question) : question.prompt;
  return createStructuredShortAnswerQuestion(question, "LONG", prompt);
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

function looksLikeQuestionText(value: string) {
  const cleaned = trimOuterPunctuation(value);
  const normalized = normalizeForComparison(cleaned);

  return (
    !cleaned ||
    cleaned.endsWith("?") ||
    /(?:^|[\s(])(p|pergunta)\s*:/i.test(cleaned) ||
    /(?:^|[\s(])(r|resposta)\s*:/i.test(cleaned) ||
    /^pergunta:/i.test(cleaned) ||
    /^resposta:/i.test(cleaned) ||
    /^(o que|por que|quais|qual|como|para que|quem|quando|onde)\b/i.test(normalized) ||
    /^(associe|relacione|complete|verdadeiro ou falso)\b/i.test(normalized)
  );
}

function isSafeStructuredAlternative(value: string) {
  const cleaned = trimOuterPunctuation(value);
  return (
    cleaned.length >= 6 &&
    !/^(?:p|r|pergunta|resposta|resposta esperada|gabarito)\s*[:\-]/i.test(cleaned) &&
    !looksLikeQuestionText(cleaned) &&
    !looksLikeSystemNoise(cleaned) &&
    !hasBrokenExtractionSymbols(cleaned) &&
    !isMetaInstructionLine(cleaned)
  );
}

function buildStructuredChoiceId(question: ParsedStructuredQuestion, index: number) {
  return `${normalizeForComparison(question.topic || question.prompt).slice(0, 48)}-${index + 1}`;
}

function getStructuredContextTokens(question: ParsedStructuredQuestion) {
  return uniqueConceptTokens(`${question.prompt} ${question.expectedAnswer} ${question.topic} ${question.sectionTitle}`);
}

function countSharedTokenValues(left: string[], right: string[]) {
  const rightSet = new Set(right);
  let shared = 0;

  for (const token of left) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }

  return shared;
}

function areStructuredKindsCompatible(
  expected: StructuredQuestionAnswerKind,
  candidate: StructuredQuestionAnswerKind,
) {
  if (expected === candidate) {
    return true;
  }

  return (
    (expected === "formula" && candidate === "numeric_case") ||
    (expected === "numeric_case" && candidate === "formula") ||
    (expected === "procedure" && candidate === "rule") ||
    (expected === "rule" && candidate === "procedure")
  );
}

function detectStructuredLead(answer: string, kind: StructuredQuestionAnswerKind) {
  const normalized = normalizeForComparison(answer);

  if (kind === "reason") {
    if (normalized.startsWith("pois ")) {
      return "pois";
    }

    if (normalized.startsWith("devido a ")) {
      return "devido a";
    }

    return "porque";
  }

  if (kind === "definition") {
    return normalized.startsWith("e ") ? "e" : "definition";
  }

  if (kind === "list") {
    return looksLikeListAnswer(answer) ? "list" : "sentence";
  }

  if (kind === "formula" || kind === "numeric_case") {
    return /\b\d+(?:[.,]\d+)?%?\b/.test(answer) ? "numeric" : "formula";
  }

  if (kind === "procedure" || kind === "rule") {
    if (/^(deve|devem)\b/i.test(normalized)) {
      return "deve";
    }

    if (/^(primeiro|antes|apos)\b/i.test(normalized)) {
      return "sequence";
    }
  }

  return "sentence";
}

function isDirectExpressionStyleAnswer(answer: string) {
  return /^(o\s+senhor|senhor|voce)\b/i.test(normalizeForComparison(answer));
}

function extractNumericTokens(value: string) {
  return [...value.matchAll(/\b\d+(?:[.,]\d+)?%?\b/g)].map((match) => match[0]);
}

function haveDistinctNumericContent(left: string, right: string) {
  const leftTokens = extractNumericTokens(left);
  const rightTokens = extractNumericTokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return true;
  }

  return leftTokens.join("|") !== rightTokens.join("|");
}

function hasCompatibleStructuredShape(
  correctAnswer: string,
  candidateAnswer: string,
  kind: StructuredQuestionAnswerKind,
) {
  switch (kind) {
    case "reason":
      return isReasonStyleAnswer(candidateAnswer);
    case "definition":
      return isDefinitionLikeStructuredAnswer(candidateAnswer);
    case "list":
      return looksLikeListAnswer(candidateAnswer);
    case "formula":
      return /=/.test(candidateAnswer) || /\b\d+(?:[.,]\d+)?%?\b/.test(candidateAnswer);
    case "numeric_case":
      return /\b\d+(?:[.,]\d+)?%?\b/.test(candidateAnswer);
    case "procedure":
      return hasProcedureLanguage(candidateAnswer);
    case "rule":
      return hasRuleLanguage(candidateAnswer);
    default:
      return detectStructuredLead(correctAnswer, kind) === detectStructuredLead(candidateAnswer, kind);
  }
}

function getStructuredRelationBucket(question: ParsedStructuredQuestion, candidate: ParsedStructuredQuestion) {
  if (candidate.sectionIndex === question.sectionIndex) {
    return "same";
  }

  const sectionSimilarity = conceptSimilarity(
    `${candidate.sectionTitle} ${candidate.topic}`,
    `${question.sectionTitle} ${question.topic}`,
  );

  if (sectionSimilarity >= 0.28 || Math.abs(candidate.sectionIndex - question.sectionIndex) <= 1) {
    return "near";
  }

  return "global";
}

function scoreStructuredDistractorCandidate(
  question: ParsedStructuredQuestion,
  candidate: ParsedStructuredQuestion,
) {
  if (candidate.prompt === question.prompt) {
    return -1;
  }

  if (
    normalizeForComparison(candidate.expectedAnswer) === normalizeForComparison(question.expectedAnswer) ||
    !isSafeStructuredAlternative(candidate.expectedAnswer) ||
    !areStructuredKindsCompatible(question.answerKind, candidate.answerKind) ||
    !hasLooselyComparableLength(candidate.expectedAnswer, question.expectedAnswer) ||
    !hasCompatibleStructuredShape(question.expectedAnswer, candidate.expectedAnswer, question.answerKind)
  ) {
    return -1;
  }

  const answerSimilarity = conceptSimilarity(candidate.expectedAnswer, question.expectedAnswer);
  const allowsNearNumericMatch =
    (question.answerKind === "numeric_case" || question.answerKind === "formula") &&
    haveDistinctNumericContent(candidate.expectedAnswer, question.expectedAnswer);
  if (answerSimilarity >= 0.82 && !allowsNearNumericMatch) {
    return -1;
  }

  const questionTokens = getStructuredContextTokens(question);
  const candidateTokens = uniqueConceptTokens(
    `${candidate.prompt} ${candidate.expectedAnswer} ${candidate.topic} ${candidate.sectionTitle}`,
  );
  const sharedTokens = countSharedTokenValues(questionTokens, candidateTokens);
  const contextSimilarity = conceptSimilarity(
    `${candidate.prompt} ${candidate.expectedAnswer} ${candidate.topic}`,
    `${question.prompt} ${question.expectedAnswer} ${question.topic}`,
  );
  const relationBucket = getStructuredRelationBucket(question, candidate);

  if (relationBucket === "global" && sharedTokens < 2 && contextSimilarity < 0.24) {
    return -1;
  }

  if (relationBucket !== "same" && sharedTokens === 0 && contextSimilarity < 0.16) {
    return -1;
  }

  const leadBonus =
    detectStructuredLead(question.expectedAnswer, question.answerKind) ===
    detectStructuredLead(candidate.expectedAnswer, question.answerKind)
      ? 1.2
      : 0;

  const bucketScore = relationBucket === "same" ? 8 : relationBucket === "near" ? 5 : 1;
  const lengthGap = Math.abs(countWords(candidate.expectedAnswer) - countWords(question.expectedAnswer));

  return (
    bucketScore +
    sharedTokens * 2.5 +
    contextSimilarity * 6 +
    leadBonus +
    (candidate.sectionIndex === question.sectionIndex ? 0.8 : 0) -
    answerSimilarity * 3 -
    Math.min(2, lengthGap / 6)
  );
}

function buildReasonDerivedDistractors(question: ParsedStructuredQuestion) {
  const keywords = extractReferenceKeywords(
    `${question.prompt} ${question.expectedAnswer} ${question.topic} ${question.sectionTitle}`,
    8,
  ).filter((token) => token.length >= 4);
  const primary = keywords[0] ?? "processo";
  const secondary = keywords[1] ?? primary;
  const tertiary = keywords[2] ?? secondary;
  const quaternary = keywords[3] ?? tertiary;
  const lead = detectStructuredLead(question.expectedAnswer, question.answerKind);

  const bodies = [
    `${primary} considera apenas ${secondary}, sem confrontar ${tertiary} durante a apuracao`,
    `${secondary} e atualizada somente depois de ${tertiary}, o que desloca ${primary} do registro original`,
    `${primary} depende exclusivamente de ${secondary} registrada, ignorando ${tertiary} e ${quaternary}`,
  ];

  return bodies.map((body) => {
    if (lead === "pois") {
      return `Pois ${body}.`;
    }

    if (lead === "devido a") {
      return `Devido a ${body}.`;
    }

    return `Porque ${body}.`;
  });
}

function buildDirectExpressionDerivedDistractors(question: ParsedStructuredQuestion) {
  const keywords = extractReferenceKeywords(
    `${question.prompt} ${question.expectedAnswer} ${question.topic} ${question.sectionTitle}`,
    6,
  );
  const objectToken = keywords.find((token) => !["senhor", "senhora", "abordagem", "corretiva"].includes(token)) ?? "produto";

  return [
    `O Senhor/Senhora precisa confirmar o registro do ${objectToken} antes de seguir.`,
    `O Senhor/Senhora deve regularizar o ${objectToken} no caixa antes de concluir.`,
    `O Senhor/Senhora pode refazer o registro do ${objectToken} antes do pagamento.`,
  ];
}

function buildNumericDerivedDistractors(question: ParsedStructuredQuestion) {
  const matches = [...question.expectedAnswer.matchAll(/\b\d+(?:[.,]\d+)?%?\b/g)].map((match) => match[0]);
  if (matches.length === 0) {
    return [];
  }

  const replacements = matches.map((value, index) => {
    const numeric = Number.parseFloat(value.replace("%", "").replace(",", "."));
    if (!Number.isFinite(numeric)) {
      return value;
    }

    const mutated = index === matches.length - 1 && value.endsWith("%") ? numeric + 20 : numeric + 1;
    const asText = Number.isInteger(mutated) ? String(mutated) : String(mutated).replace(".", ",");
    return value.endsWith("%") ? `${asText}%` : asText;
  });

  const variants: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    let variant = question.expectedAnswer;
    variant = variant.replace(matches[index]!, replacements[index]!);
    variants.push(variant);
  }

  return variants;
}

function buildDerivedStructuredDistractors(question: ParsedStructuredQuestion) {
  if (isDirectExpressionStyleAnswer(question.expectedAnswer)) {
    return buildDirectExpressionDerivedDistractors(question);
  }

  if (question.answerKind === "reason") {
    return buildReasonDerivedDistractors(question);
  }

  if (question.answerKind === "formula" || question.answerKind === "numeric_case") {
    return buildNumericDerivedDistractors(question);
  }

  return [];
}

function buildStructuredDistractorPool(
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) {
  const pool = questions
    .map((candidate) => ({
      expectedAnswer: candidate.expectedAnswer,
      score: scoreStructuredDistractorCandidate(question, candidate),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score);

  const seen = new Set(pool.map((candidate) => normalizeForComparison(candidate.expectedAnswer)));
  for (const derived of buildDerivedStructuredDistractors(question)) {
    const normalized = normalizeForComparison(derived);
    const allowsNearNumericMatch =
      (question.answerKind === "numeric_case" || question.answerKind === "formula") &&
      haveDistinctNumericContent(derived, question.expectedAnswer);
    if (
      seen.has(normalized) ||
      !isSafeStructuredAlternative(derived) ||
      !hasLooselyComparableLength(derived, question.expectedAnswer) ||
      !hasCompatibleStructuredShape(question.expectedAnswer, derived, question.answerKind) ||
      (conceptSimilarity(derived, question.expectedAnswer) >= 0.9 && !allowsNearNumericMatch)
    ) {
      continue;
    }

    pool.push({ expectedAnswer: derived, score: 0.5 });
    seen.add(normalized);
  }

  return pool
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, list) =>
      list.findIndex((item) => normalizeForComparison(item.expectedAnswer) === normalizeForComparison(candidate.expectedAnswer)) === index,
    );
}

function validateStructuredMultipleChoiceChoices(
  correctAnswer: string,
  choices: QuestionChoice[],
  prompt = "",
) {
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

  const expectedKind = classifyQuestionAnswer(prompt, correctAnswer);
  const contextTokens = uniqueConceptTokens(`${prompt} ${correctAnswer}`);
  let plausibleDistractors = 0;

  const allChoicesAreValid = choices.every((choice) => {
    if (!isSafeStructuredAlternative(choice.label)) {
      return false;
    }

    if (buildPromptSignature(choice.label) === buildPromptSignature(correctAnswer)) {
      return true;
    }

    const sharedTokens = countSharedTokenValues(contextTokens, extractConceptTokens(choice.label));
    const sameShape = hasCompatibleStructuredShape(correctAnswer, choice.label, expectedKind);
    const allowsNearNumericMatch =
      (expectedKind === "numeric_case" || expectedKind === "formula") &&
      haveDistinctNumericContent(choice.label, correctAnswer);
    const sameTheme =
      expectedKind === "association" ||
      sharedTokens >= 1 ||
      conceptSimilarity(`${prompt} ${choice.label}`, `${prompt} ${correctAnswer}`) >= 0.22;

    if (
      (conceptSimilarity(choice.label, correctAnswer) >= 0.86 && !allowsNearNumericMatch) ||
      !hasLooselyComparableLength(choice.label, correctAnswer) ||
      !sameShape ||
      !sameTheme
    ) {
      return false;
    }

    plausibleDistractors += 1;
    return true;
  });

  return allChoicesAreValid && plausibleDistractors >= 2;
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

  const prompt =
    question.promptStyle === "ASSOCIATION"
      ? `${question.associationItem ?? question.prompt} está associado a qual descrição?`
      : question.prompt;

  const choices = rotateChoices(
    [
      { id: buildStructuredChoiceId(question, 0), label: question.expectedAnswer },
      ...selected.map((candidate, index) => ({
        id: buildStructuredChoiceId(question, index + 1),
        label: candidate.expectedAnswer,
      })),
    ],
    countWords(question.expectedAnswer),
  );

  if (!validateStructuredMultipleChoiceChoices(question.expectedAnswer, choices, prompt)) {
    return null;
  }

  return {
    type: "MULTIPLE_CHOICE",
    prompt,
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
  return /^(relatório de produtos não atendidos|relatório de falta x excesso|alteração de pedidos paes industrializados|alteração de pedido sistematica \d+|gestão de estoque cobertura)$/.test(
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
  return /\b(placa|avarias|mercadoria|imprópria|consumo|danificad|gondola|oferta|carga seca|congelad)\b/i.test(
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
    const detailTokens = ["placa", "avarias", "mercadoria", "imprópria", "consumo", "gôndola", "oferta"];
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
        /^o que é (o|a|os|as|quanto|exemplo|resumo)\b/i.test(normalizedPrompt) ||
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
      ? Boolean(question.correctAnswer) &&
        question.choices.length >= 2 &&
        new Set(question.choices.map((choice) => buildPromptSignature(choice.label))).size === question.choices.length &&
        question.choices.some((choice) => buildPromptSignature(choice.label) === buildPromptSignature(question.correctAnswer!)) &&
        question.choices.every((choice) => isSafeStructuredAlternative(choice.label))
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

function ensureFinalStructuredMultipleChoice(
  questions: QuestionDraft[],
  sourceQuestions: ParsedStructuredQuestion[],
  mode: QuizMode,
) {
  if (mode !== "QUICK_REVIEW" && mode !== "DEEP_DIVE") {
    return questions;
  }

  if (questions.some((question) => question.type === "MULTIPLE_CHOICE")) {
    return questions;
  }

  const fallback = sourceQuestions
    .map((question) => createStructuredMultipleChoiceQuestion(question, sourceQuestions))
    .find((candidate) => candidate?.type === "MULTIPLE_CHOICE");
  if (!fallback) {
    return questions;
  }

  const filtered = questions.filter((question) => !areQuestionsTooSimilar(question, fallback));
  return [fallback, ...filtered];
}

function getAllowedCompositions(mode: QuizMode): QuizComposition[] {
  switch (mode) {
    case "QUICK_REVIEW":
      return ["AUTO"];
    case "DEEP_DIVE":
      return ["MULTIPLE_CHOICE_ONLY"];
    case "EXAM":
      return ["AUTO"];
    case "FEYNMAN":
      return ["DISCURSIVE_ONLY"];
    case "FLASHCARDS":
      return ["AUTO"];
  }
}

function resolveCompositionForMode(mode: QuizMode, composition?: QuizComposition) {
  const allowed = getAllowedCompositions(mode);
  return allowed.includes(composition ?? "AUTO") ? (composition ?? "AUTO") : allowed[0];
}

function buildCompositionDescription(mode: QuizMode, composition: QuizComposition) {
  if (mode === "QUICK_REVIEW" && composition === "AUTO") {
    return "Combina os tipos disponíveis no questionário: múltipla escolha, verdadeiro/falso, associação e revelar resposta.";
  }

  if (mode === "DEEP_DIVE" && composition === "MULTIPLE_CHOICE_ONLY") {
    return "Usa questões com alternativas prontas ou perguntas convertíveis com distratores plausíveis.";
  }

  if (mode === "EXAM" && composition === "AUTO") {
    return "Usa apenas afirmações marcadas como verdadeiro/falso ou certo/errado no arquivo.";
  }

  if (mode === "FLASHCARDS" && composition === "AUTO") {
    return "Usa blocos de associação para relacionar itens às respostas corretas.";
  }

  if (mode === "FEYNMAN" && composition === "DISCURSIVE_ONLY") {
    return "Mostra a pergunta, revela o gabarito e permite marcar Errei, Quase ou Acertei.";
  }

  return "Combina os tipos mais adequados para este modo.";
}

type StructuredQuestionBuilder = (
  question: ParsedStructuredQuestion,
  questions: ParsedStructuredQuestion[],
) => QuestionDraft | null;

function ensureStructuredQuestionType(
  result: QuestionDraft[],
  questions: ParsedStructuredQuestion[],
  builder: StructuredQuestionBuilder,
  type: QuestionDraft["type"],
  limit: number,
) {
  if (result.some((question) => question.type === type)) {
    return result;
  }

  const fallback = questions
    .map((question) => builder(question, questions))
    .find((candidate): candidate is QuestionDraft => candidate?.type === type);
  if (!fallback) {
    return result;
  }

  const filtered = result.filter((question) => !areQuestionsTooSimilar(question, fallback));
  return [fallback, ...filtered].slice(0, limit);
}

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

function normalizeQuestionForMode(question: QuestionDraft, mode: QuizMode): QuestionDraft {
  if (
    (mode === "QUICK_REVIEW" || mode === "FEYNMAN") &&
    question.type === "SHORT_ANSWER"
  ) {
    return {
      ...question,
      type: "REVEAL_ANSWER",
      responseFormat: "LONG",
    };
  }

  return question;
}

function isReadyDraftCompatible(question: QuestionDraft, mode: QuizMode) {
  return isQuestionCompatibleWithMode(question, mode);
}

function takeReadyDraftsForMode(
  drafts: QuestionDraft[],
  mode: QuizMode,
  _composition: QuizComposition,
  limit: number,
) {
  return shuffleArray(drafts.filter((question) => isReadyDraftCompatible(question, mode)))
    .map((question) => normalizeQuestionForMode(question, mode))
    .slice(0, limit);
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
  readyDrafts: QuestionDraft[],
  mode: QuizMode,
  composition: QuizComposition,
) {
  const target = getTargetQuestionCount(mode);
  const selectionSize = Math.max(target * 2, 24);
  const readyQuestions = takeReadyDraftsForMode(readyDrafts, mode, composition, target);
  const selected =
    mode === "DEEP_DIVE" || mode === "FEYNMAN"
      ? rankQuestionsForDeepDive(takeBalancedStructuredQuestions(questions, selectionSize))
      : takeBalancedStructuredQuestions(questions, selectionSize);
  const multipleChoice: StructuredQuestionBuilder = (question, currentQuestions) =>
    createStructuredMultipleChoiceQuestion(question, currentQuestions);
  const feynman: StructuredQuestionBuilder = (question) => createStructuredFeynmanQuestion(question);

  if (mode === "FLASHCARDS") {
    return readyQuestions.slice(0, target);
  }

  if (mode === "EXAM") {
    return readyQuestions.slice(0, target);
  }

  if (mode === "FEYNMAN") {
    return [...readyQuestions, ...createStructuredQuestionSet(selected, [feynman], target)].slice(0, target);
  }

  if (mode === "DEEP_DIVE" || composition === "MULTIPLE_CHOICE_ONLY") {
    return ensureStructuredQuestionType(
      [...readyQuestions, ...createStructuredQuestionSet(selected, [multipleChoice], target)].slice(0, target),
      selected,
      multipleChoice,
      "MULTIPLE_CHOICE",
      target,
    );
  }

  if (mode === "QUICK_REVIEW") {
    return ensureStructuredQuestionType(
      [...readyQuestions, ...createStructuredQuestionSet(selected, [multipleChoice, feynman], target)].slice(0, target),
      selected,
      multipleChoice,
      "MULTIPLE_CHOICE",
      target,
    );
  }

  return [...readyQuestions, ...createStructuredQuestionSet(selected, [feynman], target)].slice(0, target);
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

function finalizeGeneratedQuestions(
  analysis: DocumentAnalysis,
  mode: QuizMode,
  composition: QuizComposition = resolveCompositionForMode(mode),
) {
  if (analysis.structuredQuestions.length >= MINIMUM_STRUCTURED_QUESTION_PAIRS || analysis.structuredDrafts.length > 0) {
    const resolvedComposition = resolveCompositionForMode(mode, composition);
    const questions = ensureFinalStructuredMultipleChoice(
      uniqueStructuredQuestions(
        buildStructuredQuestionCandidates(
          analysis.structuredQuestions,
          analysis.structuredDrafts,
          mode,
          resolvedComposition,
        ),
      ),
      analysis.structuredQuestions,
      mode,
    );
    const target = getTargetQuestionCount(mode);

    return {
      questions: questions.slice(0, target),
      generationNote:
        questions.length < target
          ? `Este material importou ${questions.length} ${questions.length === 1 ? "pergunta útil" : "perguntas úteis"} neste modo. Mantivemos somente as perguntas com resposta confiável do arquivo.`
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
    if (analysis.structuredQuestions.length === 0 && analysis.structuredDrafts.length === 0) {
      return [];
    }

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
          questionTypes: getModeQuestionTypes(mode, preview),
          locked: getAllowedCompositions(mode).length === 1,
        };
      });

    const parsedAvailability = getAvailableModes(analysis.capabilities);
    const options: QuizModeOption[] = studyModeConfigs.map((config) => {
      const preview = getPreview(config.mode, config.composition);
      const parsedMode = parsedAvailability.find((item) => item.mode === config.mode);
      const available = preview.length > 0 || Boolean(parsedMode?.available && config.mode === "QUICK_REVIEW");

      return {
        mode: config.mode,
        title: config.title,
        tagline: config.tagline,
        description: config.description,
        questionCount: preview.length,
        questionTypes: getModeQuestionTypes(config.mode, preview),
        emphasis: analysis.emphasis,
        immediateFeedback: true,
        compositionOptions: buildCompositionOptions(config.mode),
        available,
        unavailableMessage: config.unavailableMessage,
      };
    });

    return options;
  }

  generateQuizFromDocument(document: Document, mode: QuizMode, composition?: QuizComposition): GeneratedQuiz {
    const analysis = analyzeDocument(document);
    const resolvedComposition = resolveCompositionForMode(mode, composition);
    const generated = finalizeGeneratedQuestions(analysis, mode, resolvedComposition);

    return {
      title: buildQuizSessionTitle(document.title, mode),
      mode,
      composition: resolvedComposition,
      questions: generated.questions.map((question, index) => ({
        ...question,
        topic: question.topic || `Tópico ${index + 1}`,
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

export function getUnavailableModeMessage(mode: QuizMode) {
  return getConfiguredUnavailableModeMessage(mode);
}








