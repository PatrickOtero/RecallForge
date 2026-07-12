import type { ImportCandidate, ImportReport } from "@/lib/questionnaire-import/types";
export type { ImportCandidate, ImportReport } from "@/lib/questionnaire-import/types";

export const quizModes = [
  "QUICK_REVIEW",
  "DEEP_DIVE",
  "EXAM",
  "FEYNMAN",
  "FLASHCARDS",
] as const;

export const questionTypes = [
  "MULTIPLE_CHOICE",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "FILL_BLANK",
  "SHORT_ANSWER",
  "FLASHCARD",
  "REVEAL_ANSWER",
  "MATCHING",
] as const;

export const quizCompositions = [
  "AUTO",
  "MULTIPLE_CHOICE_ONLY",
  "DISCURSIVE_ONLY",
] as const;

export const questionResponseFormats = ["SHORT", "LONG"] as const;

export const flashcardRatings = ["MISS", "ALMOST", "GOT_IT"] as const;

export const documentSources = ["MANUAL_TEXT", "TXT", "PDF", "DOCX"] as const;

export type DocumentSource = (typeof documentSources)[number];
export type QuizMode = (typeof quizModes)[number];
export type QuestionType = (typeof questionTypes)[number];
export type QuizComposition = (typeof quizCompositions)[number];
export type QuestionResponseFormat = (typeof questionResponseFormats)[number];
export type FlashcardRating = (typeof flashcardRatings)[number];

export interface Document {
  id: string;
  title: string;
  sourceType: DocumentSource;
  originalFileName: string | null;
  mimeType: string | null;
  rawText: string;
  cleanedText: string;
  chunkCount: number;
  createdAt: string;
}

export interface QuizModeOption {
  mode: QuizMode;
  title: string;
  tagline: string;
  description: string;
  questionCount: number;
  questionTypes: QuestionType[];
  emphasis: string[];
  immediateFeedback: boolean;
  compositionOptions: QuizCompositionOption[];
  available: boolean;
  unavailableMessage?: string;
}

export interface QuizCompositionOption {
  composition: QuizComposition;
  label: string;
  description: string;
  questionCount: number;
  questionTypes: QuestionType[];
  locked?: boolean;
}

export interface QuestionChoice {
  id: string;
  label: string;
  isCorrect?: boolean;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface QuestionDraft {
  type: QuestionType;
  prompt: string;
  topic: string;
  choices?: QuestionChoice[];
  matchingPairs?: MatchingPair[];
  responseFormat?: QuestionResponseFormat;
  correctAnswer?: string;
  explanation?: string;
  rubric?: string;
  referenceAnswer?: string;
}

export interface Question {
  id: string;
  sessionId: string;
  type: QuestionType;
  position: number;
  prompt: string;
  topic: string;
  choices?: QuestionChoice[];
  matchingPairs?: MatchingPair[];
  responseFormat?: QuestionResponseFormat;
  expectedAnswer?: string;
  rubric?: string;
  referenceAnswer?: string;
}

export interface QuestionForEvaluation extends Question {
  correctAnswer?: string;
  explanation?: string;
}

export interface QuizSession {
  id: string;
  documentId: string;
  mode: QuizMode;
  composition?: QuizComposition;
  title: string;
  questionCount: number;
  answeredCount: number;
  score: number | null;
  correctCount: number;
  wrongCount: number;
  weakTopics: string[];
  recommendations: string[];
  generationNote?: string;
  completedAt: string | null;
  createdAt: string;
  questions: Question[];
}

export interface AnswerAttempt {
  id: string;
  sessionId: string;
  questionId: string;
  responseText: string | null;
  selfAssessment: FlashcardRating | null;
  isCorrect: boolean | null;
  score: number | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizResultSummary {
  score: number;
  correctCount: number;
  wrongCount: number;
  weakTopics: string[];
  recommendations: string[];
}

export interface RecentSessionSummary {
  id: string;
  mode: QuizMode;
  title: string;
  score: number | null;
  createdAt: string;
  createdAtLabel: string;
}

export interface IngestDocumentResponse {
  document: Document;
  report: ImportReport;
}

export interface ConfirmImportResponse {
  options: QuizModeOption[];
  validQuestions: number;
  candidates: ImportCandidate[];
}

export interface CreateQuizSessionResponse {
  session: QuizSession;
  composition: QuizComposition;
  generationNote?: string;
}

export interface SubmitAnswerPayload {
  questionId: string;
  responseText?: string;
  selfAssessment?: FlashcardRating;
}

export interface SubmitAnswerResponse {
  attempt: AnswerAttempt;
  showImmediateFeedback: boolean;
}

export interface CompleteQuizSessionResponse {
  summary: QuizResultSummary;
}
