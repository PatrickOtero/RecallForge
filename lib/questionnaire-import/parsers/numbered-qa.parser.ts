import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  ensureSentence,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidate, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

export const numberedQaParser: QuestionnaireParser = {
  name: "numbered-qa",
  canParse(block: TextBlock) {
    return block.lines.some((line) => /^\d+[\).]\s+/.test(line)) && block.lines.some((line) => /^(?:resposta|gabarito)\s*[:.-]/iu.test(line));
  },
  parse(block: TextBlock) {
    const candidates: ImportCandidate[] = [];

    for (let index = 0; index < block.lines.length; index += 1) {
      const line = block.lines[index];
      if (!/^\d+[\).]\s+/.test(line)) {
        continue;
      }

      const next = block.lines[index + 1] ?? "";
      const following = block.lines[index + 2] ?? "";
      const answerMatch = next.match(/^(?:resposta|gabarito)\s*[:.-]\s*(.*)$/iu);

      if (!answerMatch) {
        continue;
      }

      const warnings: string[] = [];
      const question = trimOuterPunctuation(stripQuestionLabel(line.replace(/^\d+[\).]\s*/, "")));
      const answer = ensureSentence(trimOuterPunctuation(stripQuestionLabel(answerMatch[1] || following)));

      if (!question || !answer) {
        warnings.push("O par numerado está incompleto.");
      }

      candidates.push({
        id: buildImportId("numbered-qa", block.index + index, `${question}\n${answer}`),
        sourceIndex: block.index,
        rawBlock: block.rawBlock,
        parserName: "numbered-qa",
        detectedType: question && answer ? "REVEAL_ANSWER" : "UNKNOWN",
        confidence: clampConfidence(question && answer ? 0.82 : 0.45),
        warnings: uniqueWarnings(warnings),
        question,
        answer,
        sectionTitle: block.sectionTitle,
      });
    }

    return candidates;
  },
};
