import { looksLikeOptionLine } from "@/lib/questionnaire-import/parser-helpers";
import { parseMultipleChoiceCandidate } from "@/lib/questionnaire-import/parsers/multiple-choice.parser";
import type { QuestionnaireImportContext, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

function mentionsMultipleSelection(block: TextBlock) {
  return /\b(?:todas as corretas|alternativas corretas|selecione duas|selecione todas|marque todas|mais de uma)\b/i.test(
    normalizeForComparison(block.rawBlock),
  );
}

export const multiSelectParser: QuestionnaireParser = {
  name: "multi-select",
  canParse(block: TextBlock) {
    return block.lines.some((line) => looksLikeOptionLine(line)) && mentionsMultipleSelection(block);
  },
  parse(block: TextBlock, context: QuestionnaireImportContext) {
    const parsed = parseMultipleChoiceCandidate(block, context, "multi-select", "MULTI_SELECT");
    if (!parsed) {
      return [];
    }

    return [
      {
        ...parsed,
        parserName: "multi-select",
        detectedType: parsed.options?.filter((option) => option.isCorrect).length ? "MULTI_SELECT" : "UNKNOWN",
        confidence: parsed.confidence,
      },
    ];
  },
};
