import { FillBlankQuestion } from "@/components/FillBlankQuestion";
import { FlashcardQuestion } from "@/components/FlashcardQuestion";
import { MatchingQuestion } from "@/components/MatchingQuestion";
import { MultipleChoiceQuestion } from "@/components/MultipleChoiceQuestion";
import { MultiSelectQuestion } from "@/components/MultiSelectQuestion";
import { TrueFalseQuestion } from "@/components/TrueFalseQuestion";
import type { AnswerAttempt, FlashcardRating, Question } from "@/lib/types";

interface QuestionRendererProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (payload: { responseText?: string; selfAssessment?: FlashcardRating }) => void;
  question: Question;
}

export function QuestionRenderer({ attempt, disabled, onSubmit, question }: QuestionRendererProps) {
  if (question.type === "MULTIPLE_CHOICE") {
    return (
      <MultipleChoiceQuestion
        attempt={attempt}
        disabled={disabled}
        onSubmit={(responseText) => onSubmit({ responseText })}
        question={question}
      />
    );
  }

  if (question.type === "MATCHING") {
    return (
      <MatchingQuestion
        attempt={attempt}
        disabled={disabled}
        onSubmit={(responseText) => onSubmit({ responseText })}
        question={question}
      />
    );
  }

  if (question.type === "MULTI_SELECT") {
    return (
      <MultiSelectQuestion
        attempt={attempt}
        disabled={disabled}
        onSubmit={(responseText) => onSubmit({ responseText })}
        question={question}
      />
    );
  }

  if (question.type === "TRUE_FALSE") {
    return (
      <TrueFalseQuestion
        attempt={attempt}
        disabled={disabled}
        onSubmit={(responseText) => onSubmit({ responseText })}
      />
    );
  }

  if (question.type === "FILL_BLANK") {
    return (
      <FillBlankQuestion
        attempt={attempt}
        disabled={disabled}
        onSubmit={(responseText) => onSubmit({ responseText })}
      />
    );
  }

  if (question.type === "FLASHCARD" || question.type === "REVEAL_ANSWER" || question.type === "SHORT_ANSWER") {
    return (
      <FlashcardQuestion
        attempt={attempt}
        disabled={disabled}
        onSubmit={(selfAssessment) => onSubmit({ selfAssessment })}
        question={question}
      />
    );
  }

  return null;
}
