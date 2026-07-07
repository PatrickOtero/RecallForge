import type { QuestionDraft, QuestionType, QuizMode } from "@/lib/types";
import type { StudyBankCapabilities } from "@/lib/quiz-parser";
import { getStudyModeConfig, studyModeConfigs } from "@/lib/quiz-session/mode-config";

export function isQuestionCompatibleWithMode(question: QuestionDraft, mode: QuizMode) {
  switch (mode) {
    case "QUICK_REVIEW":
      return ["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FLASHCARD", "REVEAL_ANSWER"].includes(question.type);
    case "DEEP_DIVE":
      return question.type === "MULTIPLE_CHOICE";
    case "EXAM":
      return question.type === "TRUE_FALSE";
    case "FLASHCARDS":
      return question.type === "MATCHING";
    case "FEYNMAN":
      return question.type === "FLASHCARD" || question.type === "REVEAL_ANSWER" || question.type === "SHORT_ANSWER";
  }
}

export function getModeQuestionTypes(mode: QuizMode, questions: QuestionDraft[]): QuestionType[] {
  if (mode === "QUICK_REVIEW") {
    return [...new Set(questions.map((question) => question.type))];
  }

  return getStudyModeConfig(mode).fallbackQuestionTypes;
}

export function getAvailableModes(capabilities: StudyBankCapabilities) {
  return studyModeConfigs.map((config) => {
    const available =
      config.mode === "QUICK_REVIEW"
        ? capabilities.multipleChoice + capabilities.trueFalse + capabilities.matching + capabilities.revealAnswer > 0
        : config.mode === "DEEP_DIVE"
          ? capabilities.multipleChoice > 0
          : config.mode === "EXAM"
            ? capabilities.trueFalse > 0
            : config.mode === "FLASHCARDS"
              ? capabilities.matching > 0
              : capabilities.revealAnswer > 0;

    return {
      ...config,
      available,
    };
  });
}
