import type { MatchingPair, QuestionDraft } from "@/lib/types";
import { buildImportId, buildSectionTitleFallback, ensureSentence, trimOuterPunctuation } from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidate } from "@/lib/questionnaire-import/types";
import { validateImportCandidate } from "@/lib/questionnaire-import/validators";

function toMatchingPairs(candidate: ImportCandidate): MatchingPair[] {
  return (candidate.matchingPairs ?? []).map((pair, index) => ({
    id: buildImportId("match", candidate.sourceIndex + index, `${pair.left}-${pair.right}`),
    left: trimOuterPunctuation(pair.left),
    right: ensureSentence(pair.right),
  }));
}

export function convertImportCandidatesToQuestionDrafts(candidates: ImportCandidate[]) {
  return candidates.flatMap((candidate): QuestionDraft[] => {
    const { valid } = validateImportCandidate(candidate);
    if (!valid || candidate.detectedType === "UNKNOWN") {
      return [];
    }

    const topic = buildSectionTitleFallback(candidate.sectionTitle);

    if (candidate.detectedType === "MULTIPLE_CHOICE") {
      const correct = candidate.options?.find((option) => option.isCorrect);
      return correct && candidate.question
        ? [{
            type: "MULTIPLE_CHOICE",
            prompt: candidate.question,
            topic,
            choices: candidate.options?.map((option) => ({
              id: option.id,
              label: option.text,
              isCorrect: option.isCorrect,
            })),
            correctAnswer: correct.text,
            explanation: correct.text,
          }]
        : [];
    }

    if (candidate.detectedType === "MULTI_SELECT") {
      const correctIds = (candidate.options ?? []).filter((option) => option.isCorrect).map((option) => option.id);
      return candidate.question
        ? [{
            type: "MULTI_SELECT",
            prompt: candidate.question,
            topic,
            choices: candidate.options?.map((option) => ({
              id: option.id,
              label: option.text,
              isCorrect: option.isCorrect,
            })),
            correctAnswer: JSON.stringify(correctIds),
            explanation: "Confira as alternativas corretas destacadas apos confirmar.",
          }]
        : [];
    }

    if (candidate.detectedType === "STATEMENT_JUDGEMENT") {
      const correctIds = (candidate.options ?? []).filter((option) => option.isCorrect).map((option) => option.id);
      return candidate.question
        ? [{
            type: "MULTI_SELECT",
            prompt: candidate.question,
            topic,
            choices: candidate.options?.map((option) => ({
              id: option.id,
              label: option.label ? `${option.label}) ${option.text}` : option.text,
              isCorrect: option.isCorrect,
            })),
            correctAnswer: JSON.stringify(correctIds),
            explanation: "Selecione apenas as afirmacoes verdadeiras para acertar esta questao.",
          }]
        : [];
    }

    if (candidate.detectedType === "TRUE_FALSE") {
      return candidate.question && candidate.answer
        ? [{
            type: "TRUE_FALSE",
            prompt: candidate.question,
            topic,
            correctAnswer: candidate.answer,
            explanation: candidate.answer === "true" ? "A afirmacao e verdadeira." : "A afirmacao e falsa.",
          }]
        : [];
    }

    if (candidate.detectedType === "MATCHING") {
      const pairs = toMatchingPairs(candidate);
      return candidate.question && pairs.length >= 2
        ? [{
            type: "MATCHING",
            prompt: candidate.question,
            topic,
            matchingPairs: pairs,
            explanation: pairs.map((pair) => `${pair.left}: ${pair.right}`).join(" "),
          }]
        : [];
    }

    if (candidate.detectedType === "FLASHCARD") {
      return candidate.question && candidate.answer
        ? [{
            type: "FLASHCARD",
            prompt: candidate.question,
            topic,
            correctAnswer: candidate.answer,
            referenceAnswer: candidate.answer,
          }]
        : [];
    }

    if (candidate.detectedType === "FILL_BLANK") {
      return candidate.question && candidate.answer
        ? [{
            type: "FILL_BLANK",
            prompt: candidate.question,
            topic,
            correctAnswer: candidate.answer,
            explanation: candidate.answer,
          }]
        : [];
    }

    return candidate.question && candidate.answer
      ? [{
          type: "REVEAL_ANSWER",
          prompt: candidate.question,
          topic,
          correctAnswer: candidate.answer,
          referenceAnswer: candidate.answer,
          responseFormat: "LONG",
        }]
      : [];
  });
}
