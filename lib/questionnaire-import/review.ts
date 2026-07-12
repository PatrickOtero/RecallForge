import type { ImportCandidate } from "@/lib/questionnaire-import/types";
import { hydrateImportCandidate } from "@/lib/questionnaire-import/review-state";
import { validateImportCandidate } from "@/lib/questionnaire-import/validators";

export interface ImportCandidateIssue {
  candidateId: string;
  message: string;
}

export interface PreparedImportSelection {
  candidates: ImportCandidate[];
  selectedCandidates: ImportCandidate[];
  importableCandidates: ImportCandidate[];
  issues: ImportCandidateIssue[];
}

export function prepareImportSelection(candidates: ImportCandidate[]): PreparedImportSelection {
  const issues: ImportCandidateIssue[] = [];
  const preparedCandidates = candidates.map((candidate) => hydrateImportCandidate(candidate));
  const selectedCandidates = preparedCandidates.filter((candidate) => candidate.selected);
  const importableCandidates: ImportCandidate[] = [];

  const normalizedCandidates = preparedCandidates.map((candidate) => {
    if (!candidate.selected) {
      return (candidate.validationErrors?.length ?? 0) === 0
        ? candidate
        : {
            ...candidate,
            validationErrors: [],
          };
    }

    if (candidate.reviewStatus !== "CONFIRMED") {
      const message = "A questão precisa ser aprovada.";
      issues.push({ candidateId: candidate.id, message });

      return {
        ...candidate,
        validationErrors: [message],
      };
    }

    const validation = validateImportCandidate(candidate);

    for (const message of validation.errors) {
      issues.push({ candidateId: candidate.id, message });
    }

    if (validation.valid) {
      importableCandidates.push(validation.candidate);
    }

    return validation.candidate;
  });

  return {
    candidates: normalizedCandidates,
    selectedCandidates: normalizedCandidates.filter((candidate) => candidate.selected),
    importableCandidates,
    issues,
  };
}
