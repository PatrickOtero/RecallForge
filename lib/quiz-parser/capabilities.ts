import type { QuestionDraft } from "@/lib/types";
import type { StudyBankCapabilities } from "@/lib/quiz-parser/types";

export function computeStudyBankCapabilities(questions: QuestionDraft[]): StudyBankCapabilities {
  return questions.reduce<StudyBankCapabilities>(
    (capabilities, question) => {
      capabilities.total += 1;

      if (question.type === "MULTIPLE_CHOICE" || question.type === "MULTI_SELECT") {
        capabilities.multipleChoice += 1;
      }

      if (question.type === "TRUE_FALSE") {
        capabilities.trueFalse += 1;
      }

      if (question.type === "MATCHING") {
        capabilities.matching += 1;
      }

      if (question.type === "REVEAL_ANSWER" || question.type === "FLASHCARD" || question.type === "SHORT_ANSWER") {
        capabilities.revealAnswer += 1;
      }

      return capabilities;
    },
    {
      total: 0,
      multipleChoice: 0,
      trueFalse: 0,
      matching: 0,
      revealAnswer: 0,
    },
  );
}
