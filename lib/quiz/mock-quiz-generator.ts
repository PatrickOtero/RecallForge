import type {
  Document,
  QuestionChoice,
  QuestionDraft,
  QuizMode,
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

const completeSentenceEndingMatcher = /[.!?]$/;
const listLikeTitleMatcher = /\b(lista|itens|pontos|cuidados|etapas|passos|checklist)\b/i;
const procedureLikeTitleMatcher = /\b(procedimento|processo|rotina|fluxo|recebimento|armazenagem|conferencia|inventario)\b/i;
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
  /^(?:bloco|modulo|m[oó]dulo|tema|cap[ií]tulo|sec[aã]o|se[cç][aã]o)\s*\d*\s*[-–—:]?\s+(.+)$/i;
const structuredAnswerMatcher = /^(?:resposta|resposta esperada|gabarito)\s*[:\-–—]?\s*(.*)$/i;
const structuredQuestionLeadMatcher =
  /^(?:\d+[\).]\s*)?(?:qual|quais|o que|que|como|quando|onde|por que|porque|quem|explique|cite|defina|associe|relacione|complete|verdadeiro ou falso|flashcards?)\b/i;
const structuredAssociationInstructionMatcher =
  /^(?:quest[oõ]es? de associa[cç][aã]o|associe(?: cada item)?(?: [aà] resposta correta)?|associa[cç][aã]o)\b/i;
const metaInstructionMatcher =
  /^(?:use da seguinte forma|instru[cç][oõ]es? de uso|como usar|tente responder sem olhar|confira o gabarito|refa[cç]a as perguntas erradas|reveja as perguntas erradas)\b/i;
const blockedGeneratedPromptMatcher =
  /^(?:resuma em uma frase o conceito de (?:qual|quais)\b|explique (?:qual|quais)\b|use da seguinte forma\b)/i;
const definitionMatchers = [
  /^(.{3,90}?)\s+(?:e|\u00e9|eh|sao|s\u00e3o|significa|corresponde a|refere-se a|refere se a|consiste em)\s+(.{12,260})$/i,
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

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

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

  if (truncatedHeadlineMatcher.test(topic)) {
    return false;
  }

  if (/^[A-Z]{2,5}$/.test(topic)) {
    return false;
  }

  return normalized.length >= 3;
}

function cleanSectionTitle(title: string) {
  return trimOuterPunctuation(title.replace(/^\d+(\.\d+)*\s*[-:]?\s*/, ""));
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

function stripStructuredQuestionPrefix(value: string) {
  return value.replace(/^\d+[\).]\s*/, "").trim();
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
  const raw = trimOuterPunctuation(matched?.[1] ?? value);
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
  if (!prompt || !expectedAnswer || (!prompt.endsWith("?") && current.promptStyle === "QUESTION")) {
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
  return parseStructuredQuestionnaire(text).length >= 5;
}

function buildTopicFallback(section: TextSection, content: string) {
  const cleanedTitle = cleanSectionTitle(section.title);
  if (cleanedTitle && cleanedTitle !== "Visao geral" && isUsefulTopic(cleanedTitle)) {
    return cleanedTitle;
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
) {
  const topic = trimOuterPunctuation(topicInput);
  const expectedAnswer = ensureSentence(expectedAnswerInput);
  const sourceText = ensureSentence(sourceTextInput);
  const referenceExcerpt = ensureSentence(referenceExcerptInput ?? sourceTextInput);

  if (
    !isUsefulTopic(topic) ||
    !isCompleteKnowledgeText(expectedAnswer) ||
    !isCompleteKnowledgeText(sourceText, kind === "procedure" || kind === "list") ||
    !isCompleteKnowledgeText(referenceExcerpt, kind === "procedure" || kind === "list")
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

    const subject = trimOuterPunctuation(match[1]);
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

    const subject = trimOuterPunctuation(match[1]);
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
  if (!/=|\bformula|calculo|indice|percentual\b/i.test(sentence)) {
    return null;
  }

  const topic = buildTopicFallback(section, sentence);
  return createKnowledgeUnit("formula", topic, sentence, sentence, section, sentence);
}

function extractRuleUnit(sentence: string, section: TextSection) {
  if (!/\bdeve|devem|nunca|sempre|obrigatorio\b/i.test(sentence)) {
    return null;
  }

  const topic = buildTopicFallback(section, sentence);
  return createKnowledgeUnit("rule", topic, sentence, sentence, section, sentence);
}

function extractUnitsFromSentence(sentence: string, section: TextSection) {
  const cleaned = ensureSentence(sentence);
  if (!isCompleteKnowledgeText(cleaned)) {
    return [];
  }

  const definitionUnit = extractDefinitionUnit(cleaned, section);
  if (definitionUnit) {
    return [definitionUnit];
  }

  const purposeUnit = extractPurposeUnit(cleaned, section);
  if (purposeUnit) {
    return [purposeUnit];
  }

  const comparisonUnit = extractComparisonUnit(cleaned, section);
  if (comparisonUnit) {
    return [comparisonUnit];
  }

  return [extractFormulaUnit(cleaned, section), extractRuleUnit(cleaned, section)].filter(
    (unit): unit is KnowledgeUnit => Boolean(unit),
  );
}

function extractProcedureOrListUnit(section: TextSection) {
  const cleanedTitle = cleanSectionTitle(section.title);
  if (!isUsefulTopic(cleanedTitle)) {
    return null;
  }

  const validLines = section.lines
    .map((line) => trimOuterPunctuation(line))
    .filter((line) => line.length >= 8)
    .filter((line) => !looksLikeSystemNoise(line) && !hasBrokenExtractionSymbols(line));

  if (validLines.length < 2 || validLines.length > 6) {
    return null;
  }

  const kind: KnowledgeKind = listLikeTitleMatcher.test(cleanedTitle)
    ? "list"
    : procedureLikeTitleMatcher.test(cleanedTitle)
      ? "procedure"
      : "list";

  const expectedAnswer =
    kind === "procedure"
      ? `Os passos principais de ${cleanedTitle.toLowerCase()} sao: ${validLines.join("; ")}.`
      : `Os pontos principais de ${cleanedTitle.toLowerCase()} sao: ${validLines.join("; ")}.`;

  return createKnowledgeUnit(kind, cleanedTitle, expectedAnswer, expectedAnswer, section, validLines.join("; "));
}

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
  if (structuredQuestions.length >= 5) {
    return {
      sections: extractSections(document.cleanedText),
      units: [],
      structuredQuestions,
      emphasis: [...new Set(structuredQuestions.map((question) => question.topic))].slice(0, 3),
    };
  }

  const sections = extractSections(document.cleanedText);
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    const listUnit = extractProcedureOrListUnit(section);
    if (listUnit) {
      units.push(listUnit);
    }

    for (const line of section.lines) {
      units.push(...extractUnitsFromStructuredLine(line, section));
    }

    for (const sentence of splitIntoSentences(section.content)) {
      units.push(...extractUnitsFromSentence(sentence, section));
    }
  }

  return {
    sections,
    units: dedupeUnits(units),
    structuredQuestions: [],
    emphasis: extractReferenceKeywords(document.cleanedText, 3).map((keyword) => titleCase(keyword)),
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

function buildRubric(unit: KnowledgeUnit, limit = 4) {
  const keywords = unit.keywords.slice(0, limit);
  if (keywords.length === 0) {
    return "Recupere a ideia central com suas palavras.";
  }

  if (keywords.length === 1) {
    return `Mencione ${keywords[0]} ao explicar sua resposta.`;
  }

  const body = `${keywords.slice(0, -1).join(", ")} e ${keywords[keywords.length - 1]}`;
  return `Mencione ${body} ao explicar sua resposta.`;
}

function buildDirectPrompt(unit: KnowledgeUnit) {
  switch (unit.kind) {
    case "definition":
      return `O que e ${unit.topic}?`;
    case "purpose":
      return `Para que serve ${unit.topic}?`;
    case "procedure":
      return `Como funciona ${unit.topic}?`;
    case "rule":
      return `Qual e a regra principal sobre ${unit.topic}?`;
    case "formula":
      return `Como e calculado ${unit.topic}?`;
    case "comparison":
      return `Qual e a diferenca entre ${unit.topic}?`;
    case "list":
      return `Quais sao os pontos principais de ${unit.topic}?`;
  }
}

function buildQuickReviewPrompt(unit: KnowledgeUnit) {
  switch (unit.kind) {
    case "definition":
      return `Resuma em uma frase o conceito de ${unit.topic}.`;
    case "purpose":
      return `Que problema ${unit.topic} ajuda a resolver?`;
    case "procedure":
      return `Explique rapidamente como ${unit.topic} acontece na pratica.`;
    case "rule":
      return `Que cuidado principal voce deve lembrar sobre ${unit.topic}?`;
    case "formula":
      return `O que o calculo de ${unit.topic} mostra?`;
    case "comparison":
      return `Resuma a diferenca central em ${unit.topic}.`;
    case "list":
      return `Cite rapidamente os pontos centrais de ${unit.topic}.`;
  }
}

function buildFeynmanPrompt(unit: KnowledgeUnit) {
  return `Explique ${unit.topic.toLowerCase()} como se estivesse ensinando a um colega novo.`;
}

function buildMultipleChoicePrompt(unit: KnowledgeUnit) {
  switch (unit.kind) {
    case "definition":
      return `Qual alternativa define melhor ${unit.topic}?`;
    case "purpose":
      return `Qual alternativa explica melhor para que serve ${unit.topic}?`;
    case "procedure":
      return `Qual alternativa descreve corretamente como ${unit.topic} funciona?`;
    case "rule":
      return `Qual alternativa resume melhor a regra sobre ${unit.topic}?`;
    case "formula":
      return `Qual alternativa descreve corretamente ${unit.topic}?`;
    case "comparison":
      return `Qual alternativa diferencia corretamente ${unit.topic}?`;
    case "list":
      return `Qual alternativa corresponde melhor a ${unit.topic}?`;
  }
}

function buildFlashcardPrompt(unit: KnowledgeUnit) {
  return unit.topic;
}

function buildChoiceId(unit: KnowledgeUnit, index: number) {
  return `${normalizeForComparison(unit.topic)}-${index + 1}`;
}

function isBadAlternativeText(value: string) {
  return !isCompleteKnowledgeText(value) || startsLikeBadFragment(value);
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
  return units
    .filter((candidate) => candidate.id !== unit.id)
    .filter((candidate) => candidate.kind === unit.kind || conceptSimilarity(candidate.topic, unit.topic) >= 0.2)
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

function createStructuredShortAnswerQuestion(question: ParsedStructuredQuestion): QuestionDraft {
  return {
    type: "SHORT_ANSWER",
    prompt: question.promptStyle === "ASSOCIATION" ? buildAssociationPrompt(question) : question.prompt,
    topic: question.topic,
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
  const sameAssociationGroup = questions.filter(
    (candidate) =>
      question.promptStyle === "ASSOCIATION" &&
      candidate.associationGroup &&
      candidate.associationGroup === question.associationGroup,
  );

  const source = sameAssociationGroup.length >= 4 ? sameAssociationGroup : questions;
  return source
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
        (left.sectionIndex === question.sectionIndex ? 1 : 0) +
        conceptSimilarity(`${left.topic} ${left.prompt}`, `${question.topic} ${question.prompt}`);
      const rightScore =
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

function isValidQuestionDraft(question: QuestionDraft, answerReference: string) {
  const minimumPromptLength = question.type === "FLASHCARD" ? 3 : 10;
  return !(
    !question.prompt ||
    question.prompt.length < minimumPromptLength ||
    hasBrokenExtractionSymbols(question.prompt) ||
    hasBrokenExtractionSymbols(answerReference) ||
    looksLikeSystemNoise(question.prompt) ||
    blockedGeneratedPromptMatcher.test(normalizeForComparison(question.prompt))
  );
}

function uniqueQuestions(candidates: Array<GeneratedQuestionCandidate | null>, fallback: string) {
  const accepted: QuestionDraft[] = [];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const answerReference =
      candidate.question.correctAnswer ?? candidate.question.referenceAnswer ?? candidate.unit.expectedAnswer;

    if (!isValidQuestionDraft(candidate.question, answerReference)) {
      continue;
    }

    if (accepted.some((question) => areQuestionsTooSimilar(question, candidate.question))) {
      continue;
    }

    accepted.push(candidate.question);
  }

  if (accepted.length > 0) {
    return accepted;
  }

  return [
    {
      type: "SHORT_ANSWER",
      prompt: "Resuma a ideia principal do material em 2 ou 3 frases.",
      topic: "Resumo geral",
      correctAnswer: ensureSentence(fallback),
      referenceAnswer: ensureSentence(fallback),
      rubric: "Mencione o tema central, um detalhe importante e a conclusao principal.",
      explanation: "A resposta ideal mostra que voce entendeu o panorama geral.",
    } satisfies QuestionDraft,
  ];
}

function uniqueStructuredQuestions(questions: QuestionDraft[]) {
  const accepted: QuestionDraft[] = [];

  for (const question of questions) {
    const answerReference = question.correctAnswer ?? question.referenceAnswer ?? "";
    if (!isValidQuestionDraft(question, answerReference)) {
      continue;
    }

    if (accepted.some((current) => areQuestionsTooSimilar(current, question))) {
      continue;
    }

    accepted.push(question);
  }

  return accepted;
}

function buildStructuredQuestionCandidates(questions: ParsedStructuredQuestion[], mode: QuizMode) {
  const target = getTargetQuestionCount(mode);
  const selected = takeBalancedStructuredQuestions(questions, Math.max(target, mode === "EXAM" ? 20 : target));

  if (mode === "FLASHCARDS") {
    return selected.map(createStructuredFlashcardQuestion);
  }

  if (mode === "EXAM") {
    return selected.map((question) => createStructuredMultipleChoiceQuestion(question, questions) ?? createStructuredShortAnswerQuestion(question));
  }

  return selected.map(createStructuredShortAnswerQuestion);
}

function buildQuestionCandidates(analysis: DocumentAnalysis, mode: QuizMode) {
  const questions: Array<GeneratedQuestionCandidate | null> = [];
  const directUnits = selectUnitsByKinds(
    analysis.units,
    ["definition", "purpose", "rule", "procedure", "formula", "comparison", "list"],
    18,
  );

  if (mode === "QUICK_REVIEW") {
    const units = selectUnitsByKinds(analysis.units, ["definition", "purpose", "rule", "comparison"], 10);
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

function finalizeGeneratedQuestions(analysis: DocumentAnalysis, mode: QuizMode) {
  if (analysis.structuredQuestions.length >= 5) {
    const questions = uniqueStructuredQuestions(buildStructuredQuestionCandidates(analysis.structuredQuestions, mode));
    const target = getTargetQuestionCount(mode);

    return {
      questions: questions.slice(0, target),
      generationNote:
        questions.length < target
          ? `Este material importou ${questions.length} ${questions.length === 1 ? "pergunta util" : "perguntas uteis"} neste modo. Mantivemos somente as perguntas com resposta confiavel do arquivo.`
          : undefined,
    };
  }

  const fallback = analysis.sections[0]?.content ?? "";
  const questions = uniqueQuestions(buildQuestionCandidates(analysis, mode), fallback);
  const target = getTargetQuestionCount(mode);

  return {
    questions: questions.slice(0, target),
    generationNote:
      questions.length < target
        ? `Este material gerou ${questions.length} ${questions.length === 1 ? "pergunta util" : "perguntas uteis"} neste modo. Preferimos reduzir a quantidade quando o texto nao oferece conteudo confiavel suficiente.`
        : undefined,
  };
}

class MockQuizGenerator implements QuizGenerator {
  generateQuizOptions(document: Document): QuizModeOption[] {
    const analysis = analyzeDocument(document);
    const previews = {
      QUICK_REVIEW: finalizeGeneratedQuestions(analysis, "QUICK_REVIEW").questions,
      DEEP_DIVE: finalizeGeneratedQuestions(analysis, "DEEP_DIVE").questions,
      EXAM: finalizeGeneratedQuestions(analysis, "EXAM").questions,
      FEYNMAN: finalizeGeneratedQuestions(analysis, "FEYNMAN").questions,
      FLASHCARDS: finalizeGeneratedQuestions(analysis, "FLASHCARDS").questions,
    };

    return [
      {
        mode: "QUICK_REVIEW",
        title: "Revisao rapida",
        tagline: "Sintese curta para aquecer a memoria",
        description: "Prioriza explicacoes rapidas e sintese sem repetir o formato direto.",
        questionCount: previews.QUICK_REVIEW.length,
        questionTypes: [...new Set(previews.QUICK_REVIEW.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
      {
        mode: "DEEP_DIVE",
        title: "Questionario profundo",
        tagline: "Conceitos claros e verificacao cuidadosa",
        description: "Explora definicoes, finalidades, regras e comparacoes com mais contexto.",
        questionCount: previews.DEEP_DIVE.length,
        questionTypes: [...new Set(previews.DEEP_DIVE.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
      {
        mode: "EXAM",
        title: "Modo prova",
        tagline: "Mistura objetiva e discursiva",
        description: "Usa somente questoes validadas, sem preencher a prova com alternativas ruins.",
        questionCount: previews.EXAM.length,
        questionTypes: [...new Set(previews.EXAM.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: false,
      },
      {
        mode: "FEYNMAN",
        title: "Modo Feynman",
        tagline: "Explique para consolidar",
        description: "Foca em ensinar a ideia com clareza, como se voce estivesse orientando outra pessoa.",
        questionCount: previews.FEYNMAN.length,
        questionTypes: [...new Set(previews.FEYNMAN.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
      {
        mode: "FLASHCARDS",
        title: "Flashcards",
        tagline: "Frente curta, verso completo",
        description: "Mostra o conceito na frente e a resposta esperada completa no verso.",
        questionCount: previews.FLASHCARDS.length,
        questionTypes: [...new Set(previews.FLASHCARDS.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
    ];
  }

  generateQuizFromDocument(document: Document, mode: QuizMode): GeneratedQuiz {
    const analysis = analyzeDocument(document);
    const generated = finalizeGeneratedQuestions(analysis, mode);

    return {
      title: `${document.title} - ${getQuizModeTitle(mode)}`,
      mode,
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

export function generateQuizFromDocument(document: Document, mode: QuizMode) {
  return generator.generateQuizFromDocument(document, mode);
}

export function getMinimumQuestionTarget(mode: QuizMode) {
  return getTargetQuestionCount(mode);
}
