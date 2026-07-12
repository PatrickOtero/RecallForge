import { parseDirectQuestionAnswerBlock } from "@/lib/questionnaire-import/parsers/direct-qa.parser";
import { parseMultipleChoiceCandidate } from "@/lib/questionnaire-import/parsers/multiple-choice.parser";
import type { QuestionnaireImportContext, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

const htmlCopyNoiseTokens = [
  "mostrar resposta",
  "ver gabarito",
  "comentarios",
  "questao anterior",
  "proxima questao",
  "compartilhar",
];

function stripResidualNoise(block: TextBlock): TextBlock {
  return {
    ...block,
    lines: block.lines.filter((line) => !htmlCopyNoiseTokens.includes(normalizeForComparison(line))),
    rawBlock: block.lines.filter((line) => !htmlCopyNoiseTokens.includes(normalizeForComparison(line))).join("\n"),
  };
}

export const htmlCopyParser: QuestionnaireParser = {
  name: "html-copy",
  canParse(block: TextBlock) {
    const normalized = normalizeForComparison(block.rawBlock);
    return htmlCopyNoiseTokens.some((token) => normalized.includes(token));
  },
  parse(block: TextBlock, context: QuestionnaireImportContext) {
    const sanitized = stripResidualNoise(block);
    const objective = parseMultipleChoiceCandidate(sanitized, context, "html-copy");
    if (objective) {
      return [
        {
          ...objective,
          parserName: "html-copy",
          confidence: Math.max(0.6, objective.confidence - 0.12),
          warnings: [...objective.warnings, "Bloco importado de conteúdo copiado de página."],
        },
      ];
    }

    return parseDirectQuestionAnswerBlock(sanitized, "html-copy").map((candidate) => ({
      ...candidate,
      confidence: Math.max(0.6, candidate.confidence - 0.1),
      warnings: [...candidate.warnings, "Bloco importado de conteúdo copiado de página."],
    }));
  },
};
