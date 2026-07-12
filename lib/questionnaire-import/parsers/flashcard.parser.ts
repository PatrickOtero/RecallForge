import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  cleanInlineText,
  ensureSentence,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidate, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

const frontMatcher = /^(?:frente|termo)\s*[:.-]\s*(.*)$/iu;
const backMatcher = /^(?:verso|defini[cç][aã]o|definicao)\s*[:.-]\s*(.*)$/iu;

export function parseFlashcardBlock(block: TextBlock, parserName = "flashcard"): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  let front = "";
  let back = "";
  let side: "front" | "back" | null = null;

  function pushCandidate(indexOffset: number) {
    if (!front && !back) {
      return;
    }

    const warnings: string[] = [];
    const question = trimOuterPunctuation(stripQuestionLabel(front));
    const answer = ensureSentence(stripQuestionLabel(back));

    if (!question || !answer) {
      warnings.push("Frente e verso precisam estar completos.");
    }

    candidates.push({
      id: buildImportId("flashcard", block.index + indexOffset, `${question}\n${answer}`),
      sourceIndex: block.index,
      rawBlock: block.rawBlock,
      parserName,
      detectedType: question && answer ? "FLASHCARD" : "UNKNOWN",
      confidence: clampConfidence(question && answer ? 0.95 : 0.45),
      warnings: uniqueWarnings(warnings),
      question,
      answer,
      sectionTitle: block.sectionTitle,
    });

    front = "";
    back = "";
    side = null;
  }

  for (const line of block.lines) {
    const cleaned = cleanInlineText(line);
    const frontMatch = cleaned.match(frontMatcher);
    if (frontMatch) {
      if (front || back) {
        pushCandidate(candidates.length);
      }

      front = frontMatch[1] ?? "";
      side = "front";
      continue;
    }

    const backMatch = cleaned.match(backMatcher);
    if (backMatch) {
      back = backMatch[1] ?? "";
      side = "back";
      continue;
    }

    if (side === "front") {
      front = `${front} ${cleaned}`.trim();
      continue;
    }

    if (side === "back") {
      back = `${back} ${cleaned}`.trim();
    }
  }

  pushCandidate(candidates.length);
  return candidates.filter((candidate) => candidate.question || candidate.answer);
}

export const flashcardParser: QuestionnaireParser = {
  name: "flashcard",
  canParse(block: TextBlock) {
    return block.lines.some((line) => frontMatcher.test(line)) && block.lines.some((line) => backMatcher.test(line));
  },
  parse(block: TextBlock) {
    return parseFlashcardBlock(block);
  },
};
