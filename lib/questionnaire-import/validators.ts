import { trimOuterPunctuation, uniqueWarnings } from "@/lib/questionnaire-import/parser-helpers";
import { ensureUniqueOptionIds, hydrateImportCandidate } from "@/lib/questionnaire-import/review-state";
import type { ImportCandidate } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

export function validateImportCandidate(candidate: ImportCandidate) {
  const hydrated = hydrateImportCandidate(candidate);
  const normalized = ensureUniqueOptionIds(hydrated);
  const errors: string[] = [];

  if (normalized.candidate.detectedType === "MULTIPLE_CHOICE") {
    const options = normalized.candidate.options ?? [];
    const filledOptions = options.filter((option) => trimOuterPunctuation(option.text));
    const normalizedTexts = filledOptions.map((option) => normalizeForComparison(option.text));
    const correct = options.filter((option) => option.isCorrect);

    if (!trimOuterPunctuation(normalized.candidate.question ?? "")) {
      errors.push("Pergunta vazia.");
    }

    if (filledOptions.length < 2) {
      errors.push("É preciso ter pelo menos duas alternativas preenchidas.");
    }

    if (normalized.repaired) {
      errors.push("Algumas alternativas estavam duplicadas internamente e foram corrigidas. Revise o gabarito.");
    }

    if (new Set(normalizedTexts).size !== normalizedTexts.length) {
      errors.push("As alternativas devem possuir textos diferentes.");
    }

    if (correct.length === 0) {
      errors.push("Marque uma alternativa como gabarito.");
    }

    if (correct.length > 1) {
      errors.push("Questões de múltipla escolha devem possuir apenas um gabarito.");
    }
  }

  if (normalized.candidate.detectedType === "MULTI_SELECT") {
    const options = normalized.candidate.options ?? [];
    const filledOptions = options.filter((option) => trimOuterPunctuation(option.text));
    const correct = options.filter((option) => option.isCorrect);

    if (!trimOuterPunctuation(normalized.candidate.question ?? "")) {
      errors.push("Pergunta vazia.");
    }

    if (filledOptions.length < 2) {
      errors.push("Seleção múltipla precisa de pelo menos duas alternativas preenchidas.");
    }

    if (correct.length < 2) {
      errors.push("Seleção múltipla precisa de pelo menos duas respostas corretas.");
    }
  }

  if (normalized.candidate.detectedType === "STATEMENT_JUDGEMENT") {
    const options = normalized.candidate.options ?? [];
    const filledOptions = options.filter((option) => trimOuterPunctuation(option.text));
    const trueStatements = options.filter((option) => option.isCorrect);

    if (!trimOuterPunctuation(normalized.candidate.question ?? "")) {
      errors.push("Pergunta vazia.");
    }

    if (filledOptions.length < 2) {
      errors.push("Questões de julgamento precisam de pelo menos duas afirmações.");
    }

    if (trueStatements.length === 0) {
      errors.push("Marque pelo menos uma afirmacao verdadeira no gabarito.");
    }
  }

  if (normalized.candidate.detectedType === "TRUE_FALSE") {
    if (!trimOuterPunctuation(normalized.candidate.question ?? "")) {
      errors.push("Afirmação de verdadeiro/falso vazia.");
    }

    if (normalized.candidate.answer !== "true" && normalized.candidate.answer !== "false") {
      errors.push("Resposta de verdadeiro/falso não reconhecida.");
    }
  }

  if (normalized.candidate.detectedType === "MATCHING") {
    const pairs = normalized.candidate.matchingPairs ?? [];

    if (pairs.length < 2) {
      errors.push("Associação precisa de pelo menos dois pares.");
    }

    if (pairs.some((pair) => !trimOuterPunctuation(pair.left) || !trimOuterPunctuation(pair.right))) {
      errors.push("Todos os pares de associação precisam estar completos.");
    }
  }

  if (
    normalized.candidate.detectedType === "FLASHCARD"
    || normalized.candidate.detectedType === "REVEAL_ANSWER"
    || normalized.candidate.detectedType === "FILL_BLANK"
  ) {
    if (!trimOuterPunctuation(normalized.candidate.question ?? "")) {
      errors.push("Pergunta vazia.");
    }

    if (!trimOuterPunctuation(normalized.candidate.answer ?? "")) {
      errors.push("Resposta vazia.");
    }
  }

  if (normalized.candidate.detectedType === "FILL_BLANK" && !/_{3,}|\.{3,}/.test(normalized.candidate.question ?? "")) {
    errors.push("A lacuna não foi reconhecida com clareza.");
  }

  const unique = uniqueWarnings(errors);

  return {
    candidate: {
      ...normalized.candidate,
      validationErrors: unique,
    },
    valid: unique.length === 0,
    errors: unique,
  };
}
