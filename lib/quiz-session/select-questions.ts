import type { QuestionDraft, QuizMode } from "@/lib/types";
import { isQuestionCompatibleWithMode } from "@/lib/quiz-session/mode-compatibility";

export function shuffleQuestions<T>(values: T[]) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  }

  return result;
}

export function selectQuestionsForMode(questions: QuestionDraft[], mode: QuizMode, limit: number) {
  return shuffleQuestions(questions.filter((question) => isQuestionCompatibleWithMode(question, mode))).slice(0, limit);
}
