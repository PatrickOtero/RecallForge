import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import type { ContinuedDocumentLine } from "@/lib/questionnaire-import/page-continuation";
import { prepareContinuedDocumentLines } from "@/lib/questionnaire-import/page-continuation";
import {
  buildImportId,
  cleanInlineText,
  normalizeAnswerKeyReference,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import { parseFinalAnswerKey, type FinalAnswerKeyEntry } from "@/lib/questionnaire-import/parsers/final-answer-key.parser";
import { createParsedOptionId } from "@/lib/questionnaire-import/review-state";
import type { ImportCandidate, ImportCandidateOption } from "@/lib/questionnaire-import/types";
import { detectVisualContextRequirement, extractContextBlocks } from "@/lib/questionnaire-import/visual-context";
import { normalizeForComparison } from "@/lib/utils";

interface NumberedQuestionSection {
  pageEnd: number | null;
  pageStart: number | null;
  rawBlock: string;
  sourceNumber: string;
  sourceIndex: number;
  lines: ContinuedDocumentLine[];
}

interface VestibularParseResult {
  answerKeyEntries: number;
  candidates: ImportCandidate[];
  detected: boolean;
  mainQuestionCount: number;
}

const mainQuestionStartMatcher = /^(\d{1,4})\)\s*(?:\(([^)]+)\))?\s*(.*)$/u;
const optionStartMatcher = /^([a-e])[\).]\s*(.+)$/iu;
const discursivePartMatcher = /^([a-z])[\).]\s*(.+)$/iu;
const statementItemMatcher = /^(\d{2})\)\s*(.+)$/u;
const judgementPromptMatcher =
  /\b(?:assinale o que for correto|julgue os itens|considere as afirmacoes|considere as afirmações|no que se refere|marque as proposicoes corretas|marque as proposições corretas)\b/i;

function joinLines(lines: string[]) {
  return lines.map((line) => cleanInlineText(line)).filter(Boolean).join(" ").trim();
}

function formatPromptPrefix(source: string, examInfo?: string) {
  return examInfo ? `(${examInfo}) ${source}`.trim() : source;
}

function normalizePrompt(lines: string[]) {
  return trimOuterPunctuation(joinLines(lines));
}

function splitInlineOptionTail(line: string) {
  if (optionStartMatcher.test(line)) {
    return [line];
  }

  const inlineMatch = line.match(/^(.*?\S)\s+([a-e][\).]\s+.+)$/iu);
  if (!inlineMatch || inlineMatch[1].length < 20) {
    return [line];
  }

  return [cleanInlineText(inlineMatch[1]), cleanInlineText(inlineMatch[2])];
}

function isStatementJudgementSection(section: NumberedQuestionSection, answerKey?: FinalAnswerKeyEntry) {
  if (answerKey?.type === "BOOLEAN_SEQUENCE") {
    return true;
  }

  return judgementPromptMatcher.test(normalizeForComparison(section.lines.map((line) => line.text).join(" ")));
}

function isStatementItemLine(line: string) {
  const match = line.match(statementItemMatcher);
  if (!match) {
    return false;
  }

  return /^(?:01|02|04|08|16|32|64|128)$/.test(match[1]);
}

function buildCandidateWarnings(
  lines: string[],
  contextWarnings: string[],
  requiresVisualContext: boolean,
  visualContextWarning?: string,
) {
  const warnings = [...contextWarnings];

  if (requiresVisualContext && visualContextWarning) {
    warnings.push(visualContextWarning);
  }

  if (lines.length === 0) {
    warnings.push("A questao ficou incompleta durante a extracao.");
  }

  return uniqueWarnings(warnings);
}

function segmentQuestionSections(lines: ContinuedDocumentLine[], answerKeyEntries: Map<string, FinalAnswerKeyEntry>) {
  const sections: NumberedQuestionSection[] = [];
  let current: NumberedQuestionSection | null = null;

  function pushCurrent() {
    if (!current || current.lines.length === 0) {
      return;
    }

    sections.push({
      ...current,
      rawBlock: current.lines.map((line) => line.text).join("\n"),
    });
  }

  for (const line of lines) {
    const mainQuestionMatch = line.text.match(mainQuestionStartMatcher);
    const currentAnswerKey = current ? answerKeyEntries.get(normalizeAnswerKeyReference(current.sourceNumber)) : undefined;

    if (
      mainQuestionMatch
      && (!current || !(isStatementJudgementSection(current, currentAnswerKey) && isStatementItemLine(line.text)))
    ) {
      pushCurrent();

      current = {
        sourceNumber: normalizeAnswerKeyReference(mainQuestionMatch[1]),
        sourceIndex: sections.length,
        lines: [line],
        pageStart: line.page,
        pageEnd: line.page,
        rawBlock: line.text,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    current.lines.push(line);
    current.pageEnd = line.page ?? current.pageEnd;
  }

  pushCurrent();

  return sections;
}

function createBaseCandidate(
  section: NumberedQuestionSection,
  parserName: string,
  detectedType: ImportCandidate["detectedType"],
  confidence: number,
  question: string,
  warnings: string[],
) {
  return {
    id: buildImportId(parserName, section.sourceIndex, `${section.sourceNumber}\n${section.rawBlock}`),
    sourceIndex: section.sourceIndex,
    rawBlock: section.rawBlock,
    parserName,
    detectedType,
    confidence: clampConfidence(confidence),
    warnings: uniqueWarnings(warnings),
    question,
    sectionTitle: "Questionario numerado",
    sourceNumber: section.sourceNumber,
    sourcePageStart: section.pageStart ?? undefined,
    sourcePageEnd: section.pageEnd ?? undefined,
  } satisfies Partial<ImportCandidate>;
}

function parseDiscursiveCandidates(section: NumberedQuestionSection, answerKey: Extract<FinalAnswerKeyEntry, { type: "DISCURSIVE_PARTS" }>) {
  const firstLine = section.lines[0]?.text ?? "";
  const headerMatch = firstLine.match(mainQuestionStartMatcher);
  const introLines = [
    formatPromptPrefix(cleanInlineText(headerMatch?.[3] ?? ""), headerMatch?.[2]),
    ...section.lines.slice(1).map((line) => line.text),
  ].filter(Boolean);
  const promptLines: string[] = [];
  const partPrompts = new Map<string, string>();
  let beforeParts = true;

  for (const line of introLines) {
    const partMatch = line.match(discursivePartMatcher);
    if (partMatch) {
      beforeParts = false;
      partPrompts.set(partMatch[1].toLowerCase(), cleanInlineText(partMatch[2]));
      continue;
    }

    if (beforeParts) {
      promptLines.push(line);
      continue;
    }

    const lastLabel = [...partPrompts.keys()].at(-1);
    if (lastLabel) {
      partPrompts.set(lastLabel, `${partPrompts.get(lastLabel)} ${cleanInlineText(line)}`.trim());
    }
  }

  const promptPrefix = normalizePrompt(promptLines);
  const { requiresVisualContext, visualContextWarning } = detectVisualContextRequirement(section.lines.map((line) => line.text));
  const contextBlocks = extractContextBlocks(section.lines.map((line) => line.text));

  return answerKey.parts.map((part, index): ImportCandidate => {
    const partPrompt = trimOuterPunctuation(partPrompts.get(part.label) ?? "");
    const question = trimOuterPunctuation(`${promptPrefix} (${part.label}) ${partPrompt}`.trim());
    const warnings = buildCandidateWarnings(
      section.lines.map((line) => line.text),
      partPrompt ? [] : [`Nao foi possivel localizar o enunciado do subitem ${part.label}.`],
      requiresVisualContext,
      visualContextWarning,
    );

    return {
      ...createBaseCandidate(section, "multipart-discursive", "REVEAL_ANSWER", requiresVisualContext ? 0.72 : 0.82, question, warnings),
      id: buildImportId("multipart-discursive", section.sourceIndex + index, `${section.sourceNumber}${part.label}\n${section.rawBlock}`),
      answer: trimOuterPunctuation(part.answer),
      parentSourceNumber: section.sourceNumber,
      sourceNumber: `${section.sourceNumber}${part.label}`,
      requiresVisualContext,
      visualContextWarning,
      contextBlocks,
    };
  });
}

function parseStatementJudgementCandidate(
  section: NumberedQuestionSection,
  answerKey?: Extract<FinalAnswerKeyEntry, { type: "BOOLEAN_SEQUENCE" }>,
): ImportCandidate {
  const firstLine = section.lines[0]?.text ?? "";
  const headerMatch = firstLine.match(mainQuestionStartMatcher);
  const contentLines = [
    formatPromptPrefix(cleanInlineText(headerMatch?.[3] ?? ""), headerMatch?.[2]),
    ...section.lines.slice(1).map((line) => line.text),
  ].filter(Boolean);
  const promptLines: string[] = [];
  const statementBuffers: Array<{ label: string; lines: string[] }> = [];
  let currentStatement: { label: string; lines: string[] } | null = null;

  for (const line of contentLines) {
    const statementMatch = line.match(statementItemMatcher);
    if (statementMatch && isStatementItemLine(line)) {
      if (currentStatement) {
        statementBuffers.push(currentStatement);
      }

      currentStatement = {
        label: statementMatch[1],
        lines: [cleanInlineText(statementMatch[2])],
      };
      continue;
    }

    if (currentStatement) {
      currentStatement.lines.push(cleanInlineText(line));
    } else {
      promptLines.push(line);
    }
  }

  if (currentStatement) {
    statementBuffers.push(currentStatement);
  }

  const candidateId = buildImportId("statement-judgement", section.sourceIndex, `${section.sourceNumber}\n${section.rawBlock}`);
  const options: ImportCandidateOption[] = statementBuffers.map((statement, index) => ({
    id: createParsedOptionId(candidateId, section.sourceIndex, index),
    label: statement.label,
    text: trimOuterPunctuation(joinLines(statement.lines)),
    isCorrect: answerKey?.value[index],
  }));
  const { requiresVisualContext, visualContextWarning } = detectVisualContextRequirement(section.lines.map((line) => line.text));
  const warnings: string[] = [];

  if (!answerKey) {
    warnings.push("O gabarito final desta questao nao foi localizado.");
  } else if (answerKey.value.length !== options.length) {
    warnings.push("A sequencia do gabarito nao corresponde ao total de afirmacoes detectadas.");
  }

  return {
    ...createBaseCandidate(
      section,
      "statement-judgement",
      "STATEMENT_JUDGEMENT",
      !answerKey ? 0.66 : requiresVisualContext ? 0.74 : 0.84,
      normalizePrompt(promptLines),
      buildCandidateWarnings(section.lines.map((line) => line.text), warnings, requiresVisualContext, visualContextWarning),
    ),
    options,
    requiresVisualContext,
    visualContextWarning,
    contextBlocks: extractContextBlocks(section.lines.map((line) => line.text)),
  };
}

function parseMultipleChoiceCandidate(section: NumberedQuestionSection, answerKey?: FinalAnswerKeyEntry): ImportCandidate {
  const firstLine = section.lines[0]?.text ?? "";
  const headerMatch = firstLine.match(mainQuestionStartMatcher);
  const contentLines = [
    formatPromptPrefix(cleanInlineText(headerMatch?.[3] ?? ""), headerMatch?.[2]),
    ...section.lines.slice(1).map((line) => line.text),
  ]
    .filter(Boolean)
    .flatMap((line) => splitInlineOptionTail(line));
  const promptLines: string[] = [];
  const optionBuffers: Array<{ label: string; lines: string[] }> = [];
  let currentOption: { label: string; lines: string[] } | null = null;

  for (const line of contentLines) {
    const optionMatch = line.match(optionStartMatcher);
    if (optionMatch) {
      if (currentOption) {
        optionBuffers.push(currentOption);
      }

      currentOption = {
        label: optionMatch[1].toUpperCase(),
        lines: [cleanInlineText(optionMatch[2])],
      };
      continue;
    }

    if (currentOption) {
      currentOption.lines.push(cleanInlineText(line));
    } else {
      promptLines.push(line);
    }
  }

  if (currentOption) {
    optionBuffers.push(currentOption);
  }

  const candidateId = buildImportId("vestibular-multiple-choice", section.sourceIndex, `${section.sourceNumber}\n${section.rawBlock}`);
  const correctLetter = answerKey?.type === "LETTER" ? answerKey.value.toUpperCase() : undefined;
  const options: ImportCandidateOption[] = optionBuffers.map((option, index) => ({
    id: createParsedOptionId(candidateId, section.sourceIndex, index),
    label: option.label,
    text: trimOuterPunctuation(joinLines(option.lines)),
    isCorrect: correctLetter ? option.label === correctLetter : undefined,
  }));
  const { requiresVisualContext, visualContextWarning } = detectVisualContextRequirement(section.lines.map((line) => line.text));
  const warnings: string[] = [];

  if (!answerKey) {
    warnings.push("O gabarito final desta questao nao foi localizado.");
  }

  if (options.length < 2) {
    warnings.push("Foi possivel identificar poucas alternativas nesta questao.");
  }

  return {
    ...createBaseCandidate(
      section,
      "vestibular-multiple-choice",
      "MULTIPLE_CHOICE",
      !answerKey ? 0.68 : requiresVisualContext ? 0.76 : 0.92,
      normalizePrompt(promptLines),
      buildCandidateWarnings(section.lines.map((line) => line.text), warnings, requiresVisualContext, visualContextWarning),
    ),
    options,
    requiresVisualContext,
    visualContextWarning,
    contextBlocks: extractContextBlocks(section.lines.map((line) => line.text)),
  };
}

function parseFallbackRevealAnswerCandidate(section: NumberedQuestionSection, answerKey?: FinalAnswerKeyEntry): ImportCandidate {
  const firstLine = section.lines[0]?.text ?? "";
  const headerMatch = firstLine.match(mainQuestionStartMatcher);
  const question = normalizePrompt([
    formatPromptPrefix(cleanInlineText(headerMatch?.[3] ?? ""), headerMatch?.[2]),
    ...section.lines.slice(1).map((line) => line.text),
  ].filter(Boolean));
  const { requiresVisualContext, visualContextWarning } = detectVisualContextRequirement(section.lines.map((line) => line.text));

  return {
    ...createBaseCandidate(
      section,
      "vestibular-reveal-answer",
      "REVEAL_ANSWER",
      answerKey?.type === "DISCURSIVE" ? 0.8 : 0.58,
      question,
      buildCandidateWarnings(
        section.lines.map((line) => line.text),
        answerKey?.type === "DISCURSIVE" ? [] : ["A resposta final desta questao nao foi localizada."],
        requiresVisualContext,
        visualContextWarning,
      ),
    ),
    answer: answerKey?.type === "DISCURSIVE" ? trimOuterPunctuation(answerKey.value) : undefined,
    requiresVisualContext,
    visualContextWarning,
    contextBlocks: extractContextBlocks(section.lines.map((line) => line.text)),
  };
}

function buildCandidatesFromSection(section: NumberedQuestionSection, answerKeyEntries: Map<string, FinalAnswerKeyEntry>) {
  const answerKey = answerKeyEntries.get(normalizeAnswerKeyReference(section.sourceNumber));

  if (answerKey?.type === "DISCURSIVE_PARTS") {
    return parseDiscursiveCandidates(section, answerKey);
  }

  if (isStatementJudgementSection(section, answerKey)) {
    return [parseStatementJudgementCandidate(section, answerKey?.type === "BOOLEAN_SEQUENCE" ? answerKey : undefined)];
  }

  const hasOptions = section.lines.some((line) => optionStartMatcher.test(line.text) || / [a-e][\).]\s+/iu.test(line.text));
  if (hasOptions) {
    return [parseMultipleChoiceCandidate(section, answerKey)];
  }

  return [parseFallbackRevealAnswerCandidate(section, answerKey)];
}

export function parseVestibularQuestionnaire(text: string): VestibularParseResult {
  const lines = prepareContinuedDocumentLines(text);
  const finalAnswerKey = parseFinalAnswerKey(lines);

  if (finalAnswerKey.startIndex === -1 || finalAnswerKey.entries.size < 2) {
    return {
      detected: false,
      candidates: [],
      mainQuestionCount: 0,
      answerKeyEntries: finalAnswerKey.entries.size,
    };
  }

  const questionLines = lines.slice(0, finalAnswerKey.startIndex);
  const sections = segmentQuestionSections(questionLines, finalAnswerKey.entries);
  const mainQuestionCount = sections.length;

  if (mainQuestionCount < 2) {
    return {
      detected: false,
      candidates: [],
      mainQuestionCount,
      answerKeyEntries: finalAnswerKey.entries.size,
    };
  }

  return {
    detected: true,
    candidates: sections.flatMap((section) => buildCandidatesFromSection(section, finalAnswerKey.entries)),
    mainQuestionCount,
    answerKeyEntries: finalAnswerKey.entries.size,
  };
}
