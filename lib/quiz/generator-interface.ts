import type {
  Document,
  QuestionDraft,
  QuizMode,
  QuizModeOption,
} from "@/lib/types";

export interface GeneratedQuiz {
  title: string;
  mode: QuizMode;
  questions: QuestionDraft[];
}

export interface QuizGenerator {
  generateQuizOptions(document: Document): QuizModeOption[];
  generateQuizFromDocument(document: Document, mode: QuizMode): GeneratedQuiz;
}
