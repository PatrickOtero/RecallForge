import "server-only";

import type {
  AnswerAttempt,
  FlashcardRating,
  QuestionForEvaluation,
  QuizResultSummary,
} from "@/lib/types";
import { clamp, normalizeForComparison, roundScore } from "@/lib/utils";

function extractEvaluationKeywords(question: QuestionForEvaluation) {
  const source = `${question.topic} ${question.referenceAnswer ?? ""} ${question.rubric ?? ""}`;
  const words = source.match(/[\p{L}]{4,}/gu) ?? [];

  return Array.from(
    new Set(
      words
        .map((word) => normalizeForComparison(word))
        .filter((word) => word.length >= 4),
    ),
  ).slice(0, 6);
}

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

export function evaluateAnswer(
  question: QuestionForEvaluation,
  responseText?: string,
  selfAssessment?: FlashcardRating,
) {
  if (question.type === "FLASHCARD") {
    const rating = selfAssessment ?? "MISS";
    const score = scoreFlashcard(rating);

    return {
      responseText: question.referenceAnswer ?? responseText ?? null,
      selfAssessment: rating,
      isCorrect: rating === "GOT_IT",
      score,
      feedback:
        rating === "GOT_IT"
          ? "Muito bem. Esse ponto parece firme na memória."
          : rating === "ALMOST"
            ? "Quase lá. Compare sua lembrança com o trecho de referência."
            : "Vale revisar este trecho e tentar explicar de novo com suas palavras.",
    };
  }

  const safeResponse = (responseText ?? "").trim();

  if (question.type === "SHORT_ANSWER") {
    const keywords = extractEvaluationKeywords(question);
    const normalizedResponse = normalizeForComparison(safeResponse);
    const matched = keywords.filter((keyword) => normalizedResponse.includes(keyword));
    const denominator = Math.max(2, Math.min(5, keywords.length || 2));
    const score = clamp(matched.length / denominator, 0, 1);

    return {
      responseText: safeResponse,
      selfAssessment: null,
      isCorrect: score >= 0.7,
      score,
      feedback:
        matched.length > 1
          ? `Boa resposta. Você recuperou bem ${matched.join(", ")}.`
          : `Quase lá. Vale retomar ${keywords.slice(0, 3).join(", ")} ao revisar esse ponto.`,
    };
  }

  const isCorrect = compareObjectiveAnswer(question.correctAnswer ?? "", safeResponse);

  return {
    responseText: safeResponse,
    selfAssessment: null,
    isCorrect,
    score: isCorrect ? 1 : 0,
    feedback: isCorrect
      ? "Resposta correta. Você recuperou bem a ideia principal."
      : question.explanation ?? "Ainda não foi dessa vez. Revise o trecho e compare com a ideia principal.",
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
