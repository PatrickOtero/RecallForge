import type { QuizMode } from "@/lib/types";
import { getStudyModeConfig } from "@/lib/quiz-session/mode-config";

export function buildQuizSessionTitle(documentTitle: string, mode: QuizMode) {
  return `${documentTitle} - ${getStudyModeConfig(mode).title}`;
}
