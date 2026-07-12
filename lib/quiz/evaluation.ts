import type { AnswerAttempt, FlashcardRating, QuestionForEvaluation, QuizResultSummary } from "@/lib/types";
import { normalizeForComparison, roundScore, safeJsonParse } from "@/lib/utils";

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

function scoreSelfAssessment(rating: FlashcardRating) {
  const score = scoreFlashcard(rating);

  return {
    responseText: null,
    selfAssessment: rating,
    isCorrect: rating === "GOT_IT",
    score,
    feedback:
      rating === "GOT_IT"
        ? "Autoavaliação registrada como acerto."
        : rating === "ALMOST"
          ? "Autoavaliação registrada como quase. Vale passar por este ponto novamente."
          : "Autoavaliação registrada como erro. Este ponto entrou como prioridade de revisão.",
  };
}

function evaluateMatching(question: QuestionForEvaluation, responseText: string) {
  const selected = safeJsonParse<Record<string, string>>(responseText, {});
  const pairs = question.matchingPairs ?? [];
  let correctPairs = 0;

  for (const pair of pairs) {
    if (selected[pair.id] === pair.right) {
      correctPairs += 1;
    }
  }

  const score = pairs.length === 0 ? 0 : correctPairs / pairs.length;

  return {
    responseText,
    selfAssessment: null,
    isCorrect: score === 1,
    score,
    feedback:
      score === 1
        ? "Todas as associações estão corretas."
        : `Você acertou ${correctPairs} de ${pairs.length} associações. Confira os pares corretos.`,
  };
}

function evaluateMultiSelect(question: QuestionForEvaluation, responseText: string) {
  const selectedIds = new Set(safeJsonParse<string[]>(responseText, []));
  const correctIds = new Set(
    (question.choices ?? [])
      .filter((choice) => choice.isCorrect)
      .map((choice) => choice.id),
  );
  const matchesExactly =
    selectedIds.size === correctIds.size &&
    [...selectedIds].every((value) => correctIds.has(value));
  const overlap = [...selectedIds].filter((value) => correctIds.has(value)).length;
  const score = correctIds.size === 0 ? 0 : matchesExactly ? 1 : overlap / correctIds.size;

  return {
    responseText,
    selfAssessment: null,
    isCorrect: matchesExactly,
    score,
    feedback: matchesExactly
      ? "Todas as alternativas corretas foram selecionadas."
      : "Confira as alternativas corretas destacadas e tente novamente em uma nova rodada.",
  };
}

export function evaluateAnswer(
  question: QuestionForEvaluation,
  responseText?: string,
  selfAssessment?: FlashcardRating,
) {
  if (question.type === "FLASHCARD" || question.type === "REVEAL_ANSWER" || question.type === "SHORT_ANSWER") {
    return scoreSelfAssessment(selfAssessment ?? "MISS");
  }

  const safeResponse = (responseText ?? "").trim();

  if (question.type === "MATCHING") {
    return evaluateMatching(question, safeResponse);
  }

  if (question.type === "MULTI_SELECT") {
    return evaluateMultiSelect(question, safeResponse);
  }

  const isCorrect = compareObjectiveAnswer(question.correctAnswer ?? "", safeResponse);

  return {
    responseText: safeResponse,
    selfAssessment: null,
    isCorrect,
    score: isCorrect ? 1 : 0,
    feedback: isCorrect
      ? "Resposta correta."
      : question.explanation ?? "Resposta incorreta. Compare com a resposta correta antes de seguir.",
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
      ? orderedWeakTopics.map((topic) => `Revise ${topic.toLowerCase()} em uma nova rodada.`)
      : ["Seu desempenho ficou consistente. Uma nova rodada embaralhada ajuda a consolidar."];

  return {
    score: roundScore(earned / Math.max(1, questions.length)),
    correctCount,
    wrongCount,
    weakTopics: orderedWeakTopics,
    recommendations,
  };
}
