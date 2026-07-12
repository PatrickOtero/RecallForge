import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  cleanInlineText,
  ensureSentence,
  looksLikeQuestionLine,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidate, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

const questionLabelMatcher = /^(?:p|q|pergunta|quest[aã]o|questao)\s*[:.-]\s*(.*)$/iu;
const answerLabelMatcher = /^(?:r|a|resposta|gabarito|answer)\s*[:.-]\s*(.*)$/iu;

export function parseDirectQuestionAnswerBlock(
  block: TextBlock,
  parserName = "direct-qa",
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  let currentQuestion = "";
  let currentAnswer = "";
  let answerStarted = false;

  function pushCandidate(indexOffset: number) {
    if (!currentQuestion && !currentAnswer) {
      return;
    }

    const warnings: string[] = [];
    const question = trimOuterPunctuation(stripQuestionLabel(currentQuestion));
    const answer = ensureSentence(stripQuestionLabel(currentAnswer));

    if (!question) {
      warnings.push("Pergunta não encontrada com clareza.");
    }

    if (!answer) {
      warnings.push("Resposta não encontrada com clareza.");
    }

    candidates.push({
      id: buildImportId("direct-qa", block.index + indexOffset, `${question}\n${answer}`),
      sourceIndex: block.index,
      rawBlock: block.rawBlock,
      parserName,
      detectedType: question && answer ? "REVEAL_ANSWER" : "UNKNOWN",
      confidence: clampConfidence(question && answer ? 0.94 : 0.48),
      warnings: uniqueWarnings(warnings),
      question,
      answer,
      sectionTitle: block.sectionTitle,
    });

    currentQuestion = "";
    currentAnswer = "";
    answerStarted = false;
  }

  for (const line of block.lines) {
    const questionMatch = cleanInlineText(line).match(questionLabelMatcher);
    if (questionMatch) {
      if (currentQuestion || currentAnswer) {
        pushCandidate(candidates.length);
      }

      currentQuestion = questionMatch[1] ?? "";
      continue;
    }

    if (!currentQuestion && /^quest[aã]o\s*\d+\s*[:.-]?$/iu.test(line)) {
      continue;
    }

    const answerMatch = cleanInlineText(line).match(answerLabelMatcher);
    if (answerMatch) {
      answerStarted = true;
      currentAnswer = answerMatch[1] ?? "";
      continue;
    }

    if (!answerStarted && !currentQuestion && looksLikeQuestionLine(line)) {
      currentQuestion = line;
      continue;
    }

    if (answerStarted) {
      currentAnswer = `${currentAnswer} ${line}`.trim();
      continue;
    }

    if (currentQuestion) {
      currentQuestion = `${currentQuestion} ${line}`.trim();
    }
  }

  pushCandidate(candidates.length);
  return candidates.filter((candidate) => candidate.question || candidate.answer);
}

export const directQaParser: QuestionnaireParser = {
  name: "direct-qa",
  canParse(block: TextBlock) {
    return (
      block.lines.some((line) => answerLabelMatcher.test(line)) &&
      block.lines.some((line) => questionLabelMatcher.test(line) || looksLikeQuestionLine(line) || /^quest[aã]o\s*\d+\s*[:.-]?$/iu.test(line))
    );
  },
  parse(block: TextBlock) {
    return parseDirectQuestionAnswerBlock(block);
  },
};
