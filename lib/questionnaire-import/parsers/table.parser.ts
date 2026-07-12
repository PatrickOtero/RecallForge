import { parseMatchingCandidate } from "@/lib/questionnaire-import/parsers/matching.parser";
import type { QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

export const tableParser: QuestionnaireParser = {
  name: "table",
  canParse(block: TextBlock) {
    return block.lines.filter((line) => line.includes("|")).length >= 3;
  },
  parse(block: TextBlock) {
    const candidate = parseMatchingCandidate(block, "table", 0.78);
    return candidate ? [candidate] : [];
  },
};
