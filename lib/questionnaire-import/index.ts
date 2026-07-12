export { buildImportReport } from "@/lib/questionnaire-import/build-import-report";
export { clampConfidence, getImportCandidateStatus, HIGH_CONFIDENCE_THRESHOLD, REVIEW_CONFIDENCE_THRESHOLD } from "@/lib/questionnaire-import/confidence";
export { convertImportCandidatesToQuestionDrafts } from "@/lib/questionnaire-import/convert-to-study-bank";
export { detectBlockFormats } from "@/lib/questionnaire-import/detect-format";
export { normalizeQuestionnaireInput } from "@/lib/questionnaire-import/normalize-input";
export { prepareImportSelection } from "@/lib/questionnaire-import/review";
export { createOptionId, createParsedOptionId, ensureUniqueOptionIds, hydrateImportCandidate } from "@/lib/questionnaire-import/review-state";
export { splitQuestionnaireBlocks } from "@/lib/questionnaire-import/split-blocks";
export { validateImportCandidate } from "@/lib/questionnaire-import/validators";
export type {
  ImportCandidate,
  ImportCandidateContextBlock,
  ImportCandidateOption,
  ImportCandidatePair,
  ImportCandidateStatus,
  ImportDetectedType,
  ImportReport,
  QuestionnaireDocumentFormat,
  QuestionnaireImportContext,
  QuestionnaireParser,
  ReviewStatus,
  TextBlock,
} from "@/lib/questionnaire-import/types";
