import "server-only";

import type {
  AnswerAttempt,
  FlashcardRating,
  QuestionForEvaluation,
  QuizResultSummary,
} from "@/lib/types";
import {
  conceptSimilarity,
  uniqueConceptTokens,
} from "@/lib/quiz/concept-utils";
import { clamp, normalizeForComparison, roundScore } from "@/lib/utils";

const weakConcepts = new Set([
  "ajuda",
  "central",
  "coisa",
  "forma",
  "ideia",
  "momento",
  "parte",
  "ponto",
  "principal",
  "processo",
  "tipo",
]);

function compareObjectiveAnswer(expected: string, provided: string) {
  return normalizeForComparison(expected) === normalizeForComparison(provided);
}

function scoreFlashcard(rating: FlashcardRating) {
  if (rating === "GOT_IT") {
    return 1;
  }

  if (rating === "ALMOST") {
    return 0.6;
  }

  return 0;
}

function extractCoreConcepts(question: QuestionForEvaluation) {
  const expectedText = question.correctAnswer ?? question.referenceAnswer ?? "";
  const expectedTokens = uniqueConceptTokens(expectedText);
  const topicTokens = new Set(uniqueConceptTokens(question.topic));

  let filtered = expectedTokens.filter((token) => !weakConcepts.has(token) && !topicTokens.has(token));
  if (filtered.length < 2) {
    filtered = expectedTokens.filter((token) => !weakConcepts.has(token));
  }

  return filtered.slice(0, 5);
}

function scoreShortAnswer(question: QuestionForEvaluation, responseText: string) {
  const safeResponse = responseText.trim();
  const expectedText = question.correctAnswer ?? question.referenceAnswer ?? "";
  const responseTokens = new Set(uniqueConceptTokens(safeResponse));
  const coreConcepts = extractCoreConcepts(question);
  const matchedCoreConcepts = coreConcepts.filter((concept) => responseTokens.has(concept));
  const conceptCoverage =
    coreConcepts.length === 0 ? 0 : matchedCoreConcepts.length / Math.max(2, coreConcepts.length);
  const semanticSimilarity = conceptSimilarity(expectedText, safeResponse);
  let score = clamp(Math.max(conceptCoverage, semanticSimilarity * 0.92), 0, 1);

  const recoveredCentralIdea =
    matchedCoreConcepts.length >= Math.min(3, coreConcepts.length) ||
    (matchedCoreConcepts.length >= 2 && semanticSimilarity >= 0.45);

  if (recoveredCentralIdea) {
    score = Math.max(score, 0.78);
  }

  const feedback =
    score >= 0.7
      ? matchedCoreConcepts.length > 0
        ? `Boa resposta. Você recuperou a ideia central: ${matchedCoreConcepts.join(", ")}.`
        : "Boa resposta. A ideia central apareceu com suas palavras."
      : matchedCoreConcepts.length > 0
        ? `Boa base. Você recuperou ${matchedCoreConcepts.join(", ")}. Compare com a resposta esperada para fechar os detalhes.`
        : "Vale revisar este ponto e tentar recuperar melhor a ideia central com suas palavras.";

  return {
    responseText: safeResponse,
    selfAssessment: null,
    isCorrect: score >= 0.7,
    score,
    feedback,
  };
}

export function evaluateAnswer(
  question: QuestionForEvaluation,
  responseText?: string,
  selfAssessment?: FlashcardRating,
) {
  if (question.type === "FLASHCARD") {
    const rating = selfAssessment ?? "MISS";
    const score = scoreFlashcard(rating);

    return {
      responseText: question.correctAnswer ?? responseText ?? null,
      selfAssessment: rating,
      isCorrect: rating === "GOT_IT",
      score,
      feedback:
        rating === "GOT_IT"
          ? "Muito bem. Esse ponto parece firme na memória."
          : rating === "ALMOST"
            ? "Quase lá. Compare sua lembrança com a resposta esperada e o trecho de apoio."
            : "Vale revisar a resposta esperada e depois conferir o trecho de apoio.",
    };
  }

  const safeResponse = (responseText ?? "").trim();

  if (question.type === "SHORT_ANSWER") {
    return scoreShortAnswer(question, safeResponse);
  }

  const isCorrect = compareObjectiveAnswer(question.correctAnswer ?? "", safeResponse);

  return {
    responseText: safeResponse,
    selfAssessment: null,
    isCorrect,
    score: isCorrect ? 1 : 0,
    feedback: isCorrect
      ? "Resposta correta. Você recuperou bem a ideia principal."
      : question.explanation ?? "Ainda não foi dessa vez. Revise a resposta esperada e compare com a ideia principal.",
  };
}

export function summarizeQuizResults(
  questions: QuestionForEvaluation[],
  attempts: AnswerAttempt[],
): QuizResultSummary {
  const attemptsByQuestion = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  let earned = 0;
  let correctCount = 0;
  let wrongCount = 0;
  const weakTopics = new Map<string, number>();

  for (const question of questions) {
    const attempt = attemptsByQuestion.get(question.id);
    const score = attempt?.score ?? 0;

    earned += score;

    if (score >= 0.7) {
      correctCount += 1;
    } else {
      wrongCount += 1;
      weakTopics.set(question.topic, (weakTopics.get(question.topic) ?? 0) + 1);
    }
  }

  const orderedWeakTopics = Array.from(weakTopics.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([topic]) => topic)
    .slice(0, 4);

  const recommendations =
    orderedWeakTopics.length > 0
      ? orderedWeakTopics.map(
          (topic) => `Revise ${topic.toLowerCase()} e tente explicar esse ponto novamente sem consultar o material.`,
        )
      : ["Seu desempenho ficou consistente. Uma nova rodada em modo prova pode ajudar a consolidar ainda mais."];

  return {
    score: roundScore(earned / Math.max(1, questions.length)),
    correctCount,
    wrongCount,
    weakTopics: orderedWeakTopics,
    recommendations,
  };
}
