import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";

interface ImportSummaryProps {
  documentTitle: string;
  highConfidence: number;
  pendingCount: number;
  rejectedCount: number;
  confirmedCount: number;
  selectedCount: number;
  totalCandidates: number;
}

export function ImportSummary({
  documentTitle,
  highConfidence,
  pendingCount,
  rejectedCount,
  confirmedCount,
  selectedCount,
  totalCandidates,
}: ImportSummaryProps) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <div>
          <p className={styles.eyebrow}>Revisão de importação</p>
          <h2 className={styles.title}>{documentTitle}</h2>
          <p className={styles.description}>
            Revise o que o RecallForge entendeu antes de liberar os modos de estudo. Itens ambíguos ficam destacados e podem ser corrigidos manualmente.
          </p>
        </div>
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Detectadas</p>
          <p className={styles.statValue}>{totalCandidates}</p>
          <p className={styles.statHint}>Candidatas encontradas no material</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Alta confiança</p>
          <p className={styles.statValue}>{highConfidence}</p>
          <p className={styles.statHint}>Reconhecidas com boa leitura automática</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Pendentes</p>
          <p className={styles.statValue}>{pendingCount}</p>
          <p className={styles.statHint}>{rejectedCount} rejeitadas no momento</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Aprovadas</p>
          <p className={styles.statValue}>{confirmedCount}</p>
          <p className={styles.statHint}>{selectedCount} selecionadas para importar</p>
        </div>
      </div>
    </div>
  );
}
