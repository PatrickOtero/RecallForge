import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  extractQuestionNumber,
  normalizeAnswerKeyReference,
  parseBooleanAnswerToken,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidate, QuestionnaireImportContext, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

export function parseTrueFalseCandidate(
  block: TextBlock,
  context: QuestionnaireImportContext,
  parserName = "true-false",
): ImportCandidate | null {
  const lines = block.lines.filter((line) => !/^(?:gabarito|resposta)\s*[:.-]?$/iu.test(line));
  const questionNumber = extractQuestionNumber(lines[0] ?? "");
  const finalKey = questionNumber ? context.answerKey.get(normalizeAnswerKeyReference(questionNumber)) : undefined;
  const inlineAnswerLine = block.lines.find((line) => /^(?:gabarito|resposta)\s*[:.-]/iu.test(line));
  const inlineAnswer = inlineAnswerLine?.replace(/^(?:gabarito|resposta)\s*[:.-]\s*/iu, "") ?? "";
  const suffixAnswer = block.rawBlock.match(/\(([VFC E]|V|F|C|E)\)\s*$/iu)?.[1] ?? "";
  const answerToken = inlineAnswer || finalKey || suffixAnswer;
  const normalizedAnswer = parseBooleanAnswerToken(answerToken);
  const warnings: string[] = [];

  const prompt = trimOuterPunctuation(
    stripQuestionLabel(
      lines
        .filter((line) => !/^(?:gabarito|resposta)\s*[:.-]/iu.test(line))
        .join(" ")
        .replace(/\(([VFC E]|V|F|C|E)\)\s*$/iu, ""),
    ),
  );

  if (!prompt || !/verdadeiro ou falso|certo ou errado|^\d+[\).]/i.test(normalizeForComparison(block.rawBlock)) && !normalizedAnswer) {
    return null;
  }

  if (!normalizedAnswer) {
    warnings.push("Não foi possível reconhecer o gabarito de verdadeiro/falso.");
  }

  if (!/[.!?]$/.test(prompt) && !/\b(?:e|eh|sao|significa|corresponde|deve|permite|confronta|ignora|possui|tem|esta|ocorre|inclui)\b/i.test(normalizeForComparison(prompt))) {
    warnings.push("A afirmação parece incompleta.");
  }

  return {
    id: buildImportId("true-false", block.index, block.rawBlock),
    sourceIndex: block.index,
    rawBlock: block.rawBlock,
    parserName,
    detectedType: normalizedAnswer ? "TRUE_FALSE" : "UNKNOWN",
    confidence: clampConfidence(normalizedAnswer ? (inlineAnswer ? 0.95 : finalKey ? 0.8 : 0.72) : 0.4),
    warnings: uniqueWarnings(warnings),
    question: prompt,
    answer: normalizedAnswer ?? undefined,
    sectionTitle: block.sectionTitle,
  };
}

export const trueFalseParser: QuestionnaireParser = {
  name: "true-false",
  canParse(block: TextBlock) {
    const normalized = normalizeForComparison(block.rawBlock);
    return /verdadeiro ou falso|certo ou errado|\(v\)|\(f\)|\bcerto\b|\berrado\b/.test(normalized);
  },
  parse(block: TextBlock, context: QuestionnaireImportContext) {
    const candidate = parseTrueFalseCandidate(block, context);
    return candidate ? [candidate] : [];
  },
};
