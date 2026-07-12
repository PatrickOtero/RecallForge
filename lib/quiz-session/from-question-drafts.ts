import { buildQuizSessionTitle } from "@/lib/quiz-session/build-session";
import { getModeQuestionTypes, isQuestionCompatibleWithMode } from "@/lib/quiz-session/mode-compatibility";
import { studyModeConfigs } from "@/lib/quiz-session/mode-config";
import { selectQuestionsForMode } from "@/lib/quiz-session/select-questions";
import type { QuestionDraft, QuizComposition, QuizMode, QuizModeOption } from "@/lib/types";
import { computeStudyBankCapabilities } from "@/lib/quiz-parser";

const targetQuestionCounts: Record<QuizMode, number> = {
  QUICK_REVIEW: 10,
  DEEP_DIVE: 10,
  EXAM: 10,
  FEYNMAN: 10,
  FLASHCARDS: 8,
};

export function getQuestionTargetForMode(mode: QuizMode) {
  return targetQuestionCounts[mode];
}

function getDefaultComposition(mode: QuizMode): QuizComposition {
  if (mode === "DEEP_DIVE") {
    return "MULTIPLE_CHOICE_ONLY";
  }

  if (mode === "FEYNMAN") {
    return "DISCURSIVE_ONLY";
  }

  return "AUTO";
}

export function buildQuizModeOptionsFromQuestionDrafts(questions: QuestionDraft[]): QuizModeOption[] {
  const capabilities = computeStudyBankCapabilities(questions);

  return studyModeConfigs.map((config) => {
    const compatible = questions.filter((question) => isQuestionCompatibleWithMode(question, config.mode));
    const questionCount = Math.min(getQuestionTargetForMode(config.mode), compatible.length);
    const preview = compatible.slice(0, questionCount);

    return {
      mode: config.mode,
      title: config.title,
      tagline: config.tagline,
      description: config.description,
      questionCount,
      questionTypes: getModeQuestionTypes(config.mode, preview),
      emphasis: [...new Set(questions.map((question) => question.topic))].slice(0, 3),
      immediateFeedback: true,
      compositionOptions: [
        {
          composition: getDefaultComposition(config.mode),
          label: config.title,
          description: config.description,
          questionCount,
          questionTypes: getModeQuestionTypes(config.mode, preview),
          locked: true,
        },
      ],
      available:
        config.mode === "QUICK_REVIEW"
          ? capabilities.multipleChoice + capabilities.trueFalse + capabilities.matching + capabilities.revealAnswer > 0
          : config.mode === "DEEP_DIVE"
            ? capabilities.multipleChoice > 0
            : config.mode === "EXAM"
              ? capabilities.trueFalse > 0
              : config.mode === "FLASHCARDS"
                ? capabilities.matching > 0
                : capabilities.revealAnswer > 0,
      unavailableMessage: config.unavailableMessage,
    };
  });
}

export function buildQuizFromQuestionDrafts(
  documentTitle: string,
  questions: QuestionDraft[],
  mode: QuizMode,
  composition: QuizComposition = getDefaultComposition(mode),
) {
  const selectedQuestions = selectQuestionsForMode(questions, mode, getQuestionTargetForMode(mode));

  return {
    title: buildQuizSessionTitle(documentTitle, mode),
    mode,
    composition,
    questions: selectedQuestions,
  };
}
