import type {
  Document,
  QuestionDraft,
  QuizComposition,
  QuizMode,
  QuizModeOption,
} from "@/lib/types";

export interface GeneratedQuiz {
  title: string;
  mode: QuizMode;
  composition: QuizComposition;
  questions: QuestionDraft[];
}

export interface QuizGenerator {
  generateQuizOptions(document: Document): QuizModeOption[];
  generateQuizFromDocument(document: Document, mode: QuizMode, composition?: QuizComposition): GeneratedQuiz;
}
