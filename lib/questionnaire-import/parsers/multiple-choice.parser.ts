import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  cleanInlineText,
  extractQuestionNumber,
  looksLikeOptionLine,
  normalizeAnswerKeyReference,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import { createParsedOptionId } from "@/lib/questionnaire-import/review-state";
import type {
  ImportCandidate,
  ImportCandidateOption,
  QuestionnaireImportContext,
  QuestionnaireParser,
  TextBlock,
} from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

function extractOption(line: string, optionId: string, index: number) {
  const cleaned = cleanInlineText(line);
  const marked = cleaned.match(/^\((x|X| )\)\s*(.+)$/u);

  if (marked) {
    return {
      id: optionId,
      marker: String.fromCharCode(65 + index),
      text: trimOuterPunctuation(marked[2] ?? ""),
      markedCorrect: /x/i.test(marked[1] ?? ""),
    };
  }

  const standard = cleaned.match(/^(?:\(?([A-Z])\)|([A-Z])[\).])\s*(.+)$/u);
  if (!standard) {
    return null;
  }

  return {
    id: optionId,
    marker: (standard[1] ?? standard[2] ?? String.fromCharCode(65 + index)).toUpperCase(),
    text: trimOuterPunctuation(standard[3] ?? ""),
    markedCorrect: false,
  };
}

function extractInlineKey(block: TextBlock) {
  const results: string[] = [];

  for (const line of block.lines) {
    const keyMatch = line.match(/^(?:gabarito|resposta correta|resposta)\s*[:.-]\s*(.+)$/iu);
    if (!keyMatch) {
      continue;
    }

    const value = cleanInlineText(keyMatch[1] ?? "");
    for (const token of value.split(/[,\-/]/).map((item) => item.trim()).filter(Boolean)) {
      results.push(token);
    }
  }

  return results;
}

function expectsMultipleAnswers(prompt: string) {
  return /\b(?:todas as corretas|alternativas corretas|selecione duas|selecione todas|marque todas|mais de uma)\b/i.test(
    normalizeForComparison(prompt),
  );
}

function buildObjectiveCandidate(
  block: TextBlock,
  context: QuestionnaireImportContext,
  parserName: string,
  forceType?: "MULTIPLE_CHOICE" | "MULTI_SELECT",
): ImportCandidate | null {
  const questionLines: string[] = [];
  const warnings: string[] = [];
  let keySource: "inline" | "final" | "marked" | null = null;
  let currentIndex = 0;
  const candidateId = buildImportId("objective", block.index, block.rawBlock);
  const optionRows: Array<ReturnType<typeof extractOption>> = [];

  for (const line of block.lines) {
    if (looksLikeOptionLine(line)) {
      optionRows.push(extractOption(line, createParsedOptionId(candidateId, block.index, currentIndex), currentIndex));
      currentIndex += 1;
      continue;
    }

    if (/^(?:gabarito|resposta correta|resposta)\s*[:.-]/iu.test(line)) {
      continue;
    }

    questionLines.push(line);
  }

  const options = optionRows.filter(
    (
      option,
    ): option is {
      id: string;
      marker: string;
      text: string;
      markedCorrect: boolean;
    } => Boolean(option) && Boolean(option?.text),
  );
  if (options.length < 2) {
    return null;
  }

  const questionNumber = extractQuestionNumber(questionLines[0] ?? block.lines[0] ?? "");
  const prompt = trimOuterPunctuation(stripQuestionLabel(questionLines.join(" ")));
  const inlineKey = extractInlineKey(block);
  const finalKey = questionNumber ? context.answerKey.get(normalizeAnswerKeyReference(questionNumber)) : undefined;
  const correctTokens = inlineKey.length > 0 ? inlineKey : finalKey ? [finalKey] : [];

  if (options.some((option) => option.markedCorrect)) {
    keySource = "marked";
  } else if (inlineKey.length > 0) {
    keySource = "inline";
  } else if (finalKey) {
    keySource = "final";
  }

  const normalizedTokens = correctTokens.map((token) => normalizeForComparison(token));
  const candidateOptions: ImportCandidateOption[] = options.map((option) => {
    const matchesLetter = normalizedTokens.includes(normalizeForComparison(option.marker));
    const matchesText = normalizedTokens.includes(normalizeForComparison(option.text));
    return {
      id: option.id,
      text: option.text,
      isCorrect: option.markedCorrect || matchesLetter || matchesText,
    };
  });

  const correctCount = candidateOptions.filter((option) => option.isCorrect).length;
  const isMultiSelect = forceType === "MULTI_SELECT" || correctCount > 1 || expectsMultipleAnswers(prompt);
  const detectedType = correctCount === 0
    ? "UNKNOWN"
    : isMultiSelect
      ? "MULTI_SELECT"
      : "MULTIPLE_CHOICE";

  if (correctCount === 0) {
    warnings.push("As alternativas foram encontradas, mas não havia gabarito confiável.");
  }

  if (keySource === "final") {
    warnings.push("Gabarito vinculado a partir de uma seção de respostas separada.");
  }

  const confidence = clampConfidence(
    detectedType === "UNKNOWN"
      ? 0.42
      : keySource === "inline" || keySource === "marked"
        ? 0.95
        : keySource === "final"
          ? 0.8
          : 0.6,
  );

  return {
    id: candidateId,
    sourceIndex: block.index,
    rawBlock: block.rawBlock,
    parserName,
    detectedType,
    confidence,
    warnings: uniqueWarnings(warnings),
    question: prompt,
    options: candidateOptions,
    sectionTitle: block.sectionTitle,
  };
}

export function parseMultipleChoiceCandidate(
  block: TextBlock,
  context: QuestionnaireImportContext,
  parserName = "multiple-choice",
  forceType?: "MULTIPLE_CHOICE" | "MULTI_SELECT",
) {
  const candidate = buildObjectiveCandidate(block, context, parserName, forceType ?? "MULTIPLE_CHOICE");
  if (!candidate || (!forceType && candidate.detectedType === "MULTI_SELECT")) {
    return null;
  }

  return candidate;
}

export const multipleChoiceParser: QuestionnaireParser = {
  name: "multiple-choice",
  canParse(block: TextBlock) {
    return block.lines.some((line) => looksLikeOptionLine(line));
  },
  parse(block: TextBlock, context: QuestionnaireImportContext) {
    const candidate = buildObjectiveCandidate(block, context, "multiple-choice");
    if (!candidate || candidate.detectedType === "MULTI_SELECT") {
      return [];
    }

    return [candidate];
  },
};
