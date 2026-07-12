"use client";

import { useMemo, useState } from "react";

import { ImportCandidateList } from "@/components/import-review/ImportCandidateList";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";
import { ImportSummary } from "@/components/import-review/ImportSummary";
import { hydrateImportCandidate, prepareImportSelection, validateImportCandidate } from "@/lib/questionnaire-import";
import type { ImportCandidate, ImportReport, ReviewStatus } from "@/lib/questionnaire-import";
import type { ConfirmImportResponse } from "@/lib/types";

interface ImportReviewPageProps {
  documentId: string;
  documentTitle: string;
  onBack: () => void;
  onConfirmed: (payload: ConfirmImportResponse) => void;
  report: ImportReport;
}

type ReviewFilter = "ALL" | ReviewStatus;

const filterLabels: Record<ReviewFilter, string> = {
  ALL: "Todas",
  CONFIRMED: "Aprovadas",
  PENDING: "Pendentes",
  REJECTED: "Rejeitadas",
};

function markCandidateAsEdited(candidate: ImportCandidate, updates: Partial<ImportCandidate>) {
  const merged = hydrateImportCandidate({
    ...candidate,
    ...updates,
    validationErrors: [],
  });

  return {
    ...merged,
    reviewStatus: "PENDING" as const,
  };
}

export function ImportReviewPage({
  documentId,
  documentTitle,
  onBack,
  onConfirmed,
  report,
}: ImportReviewPageProps) {
  const [candidates, setCandidates] = useState<ImportCandidate[]>(() => report.candidates.map((candidate) => hydrateImportCandidate(candidate)));
  const [filter, setFilter] = useState<ReviewFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visibleCandidates = useMemo(() => {
    return candidates.filter((candidate) => (filter === "ALL" ? true : candidate.reviewStatus === filter));
  }, [candidates, filter]);

  const confirmedCount = candidates.filter((candidate) => candidate.reviewStatus === "CONFIRMED").length;
  const pendingCount = candidates.filter((candidate) => candidate.reviewStatus === "PENDING").length;
  const rejectedCount = candidates.filter((candidate) => candidate.reviewStatus === "REJECTED").length;
  const selectedCount = candidates.filter((candidate) => candidate.selected).length;

  function updateCandidate(candidateId: string, updates: Partial<ImportCandidate>) {
    setCandidates((current) =>
      current.map((candidate) => (candidate.id === candidateId ? markCandidateAsEdited(candidate, updates) : candidate)),
    );
  }

  function toggleSelected(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) => (
        candidate.id === candidateId
          ? {
              ...candidate,
              selected: !candidate.selected,
              validationErrors: candidate.reviewStatus === "CONFIRMED" ? [] : candidate.validationErrors ?? [],
            }
          : candidate
      )),
    );
  }

  function approveCandidate(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) => {
        if (candidate.id !== candidateId) {
          return candidate;
        }

        const validation = validateImportCandidate(candidate);
        if (!validation.valid) {
          return {
            ...validation.candidate,
            reviewStatus: candidate.reviewStatus ?? "PENDING",
          };
        }

        return {
          ...validation.candidate,
          reviewStatus: "CONFIRMED" as const,
          selected: true,
          validationErrors: [],
        };
      }),
    );
  }

  function rejectCandidate(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) => (
        candidate.id === candidateId
          ? {
              ...hydrateImportCandidate(candidate),
              reviewStatus: "REJECTED" as const,
              selected: false,
              validationErrors: [],
            }
          : candidate
      )),
    );
  }

  function handleConfirm() {
    const prepared = prepareImportSelection(candidates);
    const selectedPendingCount = prepared.selectedCandidates.filter((candidate) => candidate.reviewStatus !== "CONFIRMED").length;
    const invalidSelectedCount = prepared.selectedCandidates.filter(
      (candidate) => candidate.reviewStatus === "CONFIRMED" && (candidate.validationErrors?.length ?? 0) > 0,
    ).length;

    setCandidates(prepared.candidates);
    setError(null);

    if (prepared.selectedCandidates.length === 0) {
      setError("Nenhuma questão selecionada foi aprovada.");
      return;
    }

    if (selectedPendingCount > 0) {
      setError(
        selectedPendingCount === 1
          ? "A questão precisa ser aprovada."
          : `${selectedPendingCount} questões selecionadas ainda precisam ser aprovadas.`,
      );
      return;
    }

    if (invalidSelectedCount > 0 || prepared.importableCandidates.length !== prepared.selectedCandidates.length) {
      setError("Revise os campos destacados antes de importar.");
      return;
    }

    setIsSubmitting(true);

    void (async () => {
      const response = await fetch("/api/import-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          candidates: prepared.candidates,
        }),
      });

      const payload = (await response.json()) as ConfirmImportResponse & {
        error?: string;
        issues?: Array<{ candidateId: string; message: string }>;
      };

      setIsSubmitting(false);

      if (!response.ok) {
        if (Array.isArray(payload.issues) && payload.issues.length > 0) {
          setCandidates((current) =>
            current.map((candidate) => {
              const issues = payload.issues?.filter((issue) => issue.candidateId === candidate.id).map((issue) => issue.message) ?? [];
              return issues.length > 0 ? { ...candidate, validationErrors: issues } : candidate;
            }),
          );
        }

        setError(payload.error ?? "Não foi possível preparar a importação.");
        return;
      }

      onConfirmed(payload);
    })();
  }

  return (
    <div className={styles.page}>
      <ImportSummary
        documentTitle={documentTitle}
        totalCandidates={report.totalCandidates}
        highConfidence={report.highConfidence}
        pendingCount={pendingCount}
        rejectedCount={rejectedCount}
        confirmedCount={confirmedCount}
        selectedCount={selectedCount}
      />

      <div className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div className={styles.filters}>
            {(Object.keys(filterLabels) as ReviewFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={styles.filterButton({ active: filter === item })}
              >
                {filterLabels[item]}
              </button>
            ))}
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={onBack} className={styles.secondaryButton}>
              Voltar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className={styles.primaryButton}
            >
              {isSubmitting ? "Preparando modos..." : "Importar selecionadas"}
            </button>
          </div>
        </div>

        {error ? <div className={styles.warningPanel}>{error}</div> : null}
      </div>

      <ImportCandidateList
        candidates={visibleCandidates}
        onApprove={approveCandidate}
        onChange={updateCandidate}
        onReject={rejectCandidate}
        onToggleSelected={toggleSelected}
      />
    </div>
  );
}
