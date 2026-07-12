import { getImportCandidateStatus } from "@/lib/questionnaire-import/confidence";
import type { ImportCandidate, ImportCandidateOption, ReviewStatus } from "@/lib/questionnaire-import/types";

function buildOptionIdSuffix() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createOptionId(candidateId: string) {
  return `${candidateId}-option-${buildOptionIdSuffix()}`;
}

export function createParsedOptionId(candidateId: string, sourceIndex: number, optionIndex: number) {
  return `${candidateId}-option-${sourceIndex}-${optionIndex}`;
}

function getDefaultReviewStatus(candidate: Pick<ImportCandidate, "confidence" | "detectedType">): ReviewStatus {
  const parserStatus = getImportCandidateStatus(candidate);

  if (parserStatus === "HIGH_CONFIDENCE") {
    return "CONFIRMED";
  }

  if (parserStatus === "NEEDS_REVIEW") {
    return "PENDING";
  }

  return "REJECTED";
}

function normalizeOptions(
  candidateId: string,
  options: ImportCandidateOption[] | undefined,
) {
  if (!options || options.length === 0) {
    return { options, repaired: false };
  }

  const seen = new Set<string>();
  let repaired = false;

  const normalized = options.map((option) => {
    const currentId = option.id.trim();
    let nextId = currentId;

    if (!currentId || seen.has(currentId)) {
      repaired = true;
      nextId = createOptionId(candidateId);

      while (seen.has(nextId)) {
        nextId = createOptionId(candidateId);
      }
    }

    seen.add(nextId);

    return nextId === option.id ? option : { ...option, id: nextId };
  });

  return { options: normalized, repaired };
}

export function ensureUniqueOptionIds(candidate: ImportCandidate) {
  const normalized = normalizeOptions(candidate.id, candidate.options);
  if (!normalized.repaired) {
    return {
      candidate,
      repaired: false,
    };
  }

  return {
    candidate: {
      ...candidate,
      options: normalized.options,
    },
    repaired: true,
  };
}

export function hydrateImportCandidate(candidate: ImportCandidate): ImportCandidate {
  const reviewStatus = candidate.reviewStatus ?? getDefaultReviewStatus(candidate);
  const selected = candidate.selected ?? reviewStatus === "CONFIRMED";
  const normalized = ensureUniqueOptionIds({
    ...candidate,
    reviewStatus,
    selected,
    validationErrors: candidate.validationErrors ?? [],
  });

  return normalized.candidate;
}
