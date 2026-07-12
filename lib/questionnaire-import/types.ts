export type ImportDetectedType =
  | "MULTIPLE_CHOICE"
  | "MULTI_SELECT"
  | "STATEMENT_JUDGEMENT"
  | "TRUE_FALSE"
  | "MATCHING"
  | "REVEAL_ANSWER"
  | "FLASHCARD"
  | "FILL_BLANK"
  | "UNKNOWN";

export type ImportCandidateStatus = "HIGH_CONFIDENCE" | "NEEDS_REVIEW" | "REJECTED";
export type ReviewStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type QuestionnaireDocumentFormat = "GENERIC" | "NUMBERED_QUESTIONNAIRE_WITH_FINAL_ANSWER_KEY";

export interface ImportCandidateOption {
  id: string;
  text: string;
  isCorrect?: boolean;
  label?: string;
}

export interface ImportCandidatePair {
  left: string;
  right: string;
}

export interface ImportCandidateContextBlock {
  type: "TABLE_TEXT";
  content: string;
}

export interface ImportCandidate {
  id: string;
  sourceIndex: number;
  rawBlock: string;
  parserName: string;
  detectedType: ImportDetectedType;
  confidence: number;
  warnings: string[];
  question?: string;
  answer?: string;
  options?: ImportCandidateOption[];
  matchingPairs?: ImportCandidatePair[];
  sectionTitle?: string;
  sourceNumber?: string;
  parentSourceNumber?: string;
  sourcePageStart?: number;
  sourcePageEnd?: number;
  requiresVisualContext?: boolean;
  visualContextWarning?: string;
  contextBlocks?: ImportCandidateContextBlock[];
  selected?: boolean;
  reviewStatus?: ReviewStatus;
  validationErrors?: string[];
}

export interface ImportReport {
  detectedFormat: QuestionnaireDocumentFormat;
  totalCandidates: number;
  highConfidence: number;
  needsReview: number;
  rejected: number;
  candidates: ImportCandidate[];
}

export interface TextBlock {
  index: number;
  rawBlock: string;
  lines: string[];
  sectionTitle?: string;
}

export interface QuestionnaireImportContext {
  answerKey: Map<string, string>;
  blocks: TextBlock[];
  normalizedText: string;
}

export interface QuestionnaireParser {
  name: string;
  canParse(block: TextBlock, context: QuestionnaireImportContext): boolean;
  parse(block: TextBlock, context: QuestionnaireImportContext): ImportCandidate[];
}
