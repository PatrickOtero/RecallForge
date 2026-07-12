import { normalizeTypeHeader } from "@/lib/questionnaire-import/parser-helpers";
import { parseDirectQuestionAnswerBlock } from "@/lib/questionnaire-import/parsers/direct-qa.parser";
import { parseFillBlankCandidate } from "@/lib/questionnaire-import/parsers/fill-blank.parser";
import { parseFlashcardBlock } from "@/lib/questionnaire-import/parsers/flashcard.parser";
import { parseMatchingCandidate } from "@/lib/questionnaire-import/parsers/matching.parser";
import { parseMultipleChoiceCandidate } from "@/lib/questionnaire-import/parsers/multiple-choice.parser";
import { parseTrueFalseCandidate } from "@/lib/questionnaire-import/parsers/true-false.parser";
import type { QuestionnaireImportContext, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

function getTypedHeader(block: TextBlock) {
  const first = block.lines[0] ?? "";
  return /^\[[^\]]+\]$/.test(first) ? normalizeTypeHeader(first) : null;
}

export const explicitTypedBlockParser: QuestionnaireParser = {
  name: "explicit-typed-block",
  canParse(block: TextBlock) {
    return Boolean(getTypedHeader(block));
  },
  parse(block: TextBlock, context: QuestionnaireImportContext) {
    const header = getTypedHeader(block);
    const contentBlock: TextBlock = {
      ...block,
      lines: block.lines.slice(1),
      rawBlock: block.lines.slice(1).join("\n"),
    };

    if (!header) {
      return [];
    }

    if (header.includes("ASSOCIACAO") || header.includes("MATCHING")) {
      const candidate = parseMatchingCandidate(contentBlock, "explicit-typed-block", 0.95);
      return candidate ? [{ ...candidate, parserName: "explicit-typed-block" }] : [];
    }

    if (header.includes("VERDADEIRO") || header.includes("FALSO") || header.includes("CERTO")) {
      const candidate = parseTrueFalseCandidate(contentBlock, context, "explicit-typed-block");
      return candidate ? [{ ...candidate, parserName: "explicit-typed-block", confidence: Math.max(candidate.confidence, 0.95) }] : [];
    }

    if (header.includes("MULTIPLA") || header.includes("MULTIPLE")) {
      const candidate = parseMultipleChoiceCandidate(contentBlock, context, "explicit-typed-block");
      return candidate ? [{ ...candidate, parserName: "explicit-typed-block", confidence: Math.max(candidate.confidence, 0.95) }] : [];
    }

    if (header.includes("REVELAR") || header.includes("RESPOSTA")) {
      return parseDirectQuestionAnswerBlock(contentBlock, "explicit-typed-block").map((candidate) => ({
        ...candidate,
        parserName: "explicit-typed-block",
        confidence: Math.max(candidate.confidence, 0.93),
      }));
    }

    if (header.includes("FLASHCARD") || header.includes("TERMO")) {
      return parseFlashcardBlock(contentBlock, "explicit-typed-block").map((candidate) => ({
        ...candidate,
        parserName: "explicit-typed-block",
        confidence: Math.max(candidate.confidence, 0.95),
      }));
    }

    if (header.includes("LACUNA")) {
      const candidate = parseFillBlankCandidate(contentBlock, "explicit-typed-block");
      return candidate ? [{ ...candidate, parserName: "explicit-typed-block", confidence: Math.max(candidate.confidence, 0.93) }] : [];
    }

    return [];
  },
};
