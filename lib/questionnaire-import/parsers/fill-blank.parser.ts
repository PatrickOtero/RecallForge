import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  ensureSentence,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidate, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

export function parseFillBlankCandidate(block: TextBlock, parserName = "fill-blank"): ImportCandidate | null {
  const promptLine = block.lines.find((line) => /_{3,}|\.{3,}/.test(line));
  const answerLine = block.lines.find((line) => /^(?:resposta|gabarito)\s*[:.-]/iu.test(line));
  if (!promptLine || !answerLine) {
    return null;
  }

  const warnings: string[] = [];
  const question = trimOuterPunctuation(stripQuestionLabel(promptLine));
  const answer = ensureSentence(answerLine.replace(/^(?:resposta|gabarito)\s*[:.-]\s*/iu, ""));

  if (!question || !answer) {
    warnings.push("A lacuna está incompleta.");
  }

  return {
    id: buildImportId("fill-blank", block.index, block.rawBlock),
    sourceIndex: block.index,
    rawBlock: block.rawBlock,
    parserName,
    detectedType: question && answer ? "FILL_BLANK" : "UNKNOWN",
    confidence: clampConfidence(question && answer ? 0.92 : 0.45),
    warnings: uniqueWarnings(warnings),
    question,
    answer,
    sectionTitle: block.sectionTitle,
  };
}

export const fillBlankParser: QuestionnaireParser = {
  name: "fill-blank",
  canParse(block: TextBlock) {
    return /_{3,}|\.{3,}/.test(block.rawBlock) && /^(?:resposta|gabarito)\s*[:.-]/imu.test(block.rawBlock);
  },
  parse(block: TextBlock) {
    const candidate = parseFillBlankCandidate(block);
    return candidate ? [candidate] : [];
  },
};
