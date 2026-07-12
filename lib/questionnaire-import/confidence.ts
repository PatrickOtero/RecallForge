import type { ImportCandidate, ImportCandidateStatus } from "@/lib/questionnaire-import/types";

export const HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const REVIEW_CONFIDENCE_THRESHOLD = 0.55;

export function clampConfidence(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function getImportCandidateStatus(candidate: Pick<ImportCandidate, "confidence" | "detectedType">): ImportCandidateStatus {
  if (candidate.detectedType === "UNKNOWN" || candidate.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    return "REJECTED";
  }

  if (candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return "HIGH_CONFIDENCE";
  }

  return "NEEDS_REVIEW";
}
