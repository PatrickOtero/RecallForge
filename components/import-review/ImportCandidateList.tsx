import { ImportCandidateCard } from "@/components/import-review/ImportCandidateCard";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";
import type { ImportCandidate } from "@/lib/questionnaire-import";

interface ImportCandidateListProps {
  candidates: ImportCandidate[];
  onApprove: (candidateId: string) => void;
  onChange: (candidateId: string, updates: Partial<ImportCandidate>) => void;
  onReject: (candidateId: string) => void;
  onToggleSelected: (candidateId: string) => void;
}

export function ImportCandidateList({
  candidates,
  onApprove,
  onChange,
  onReject,
  onToggleSelected,
}: ImportCandidateListProps) {
  if (candidates.length === 0) {
    return <div className={styles.emptyState}>Nenhum item corresponde ao filtro atual.</div>;
  }

  return (
    <div className={styles.candidateList}>
      {candidates.map((candidate) => (
        <ImportCandidateCard
          key={candidate.id}
          candidate={candidate}
          onApprove={() => onApprove(candidate.id)}
          onChange={(updates) => onChange(candidate.id, updates)}
          onReject={() => onReject(candidate.id)}
          onToggleSelected={() => onToggleSelected(candidate.id)}
        />
      ))}
    </div>
  );
}
