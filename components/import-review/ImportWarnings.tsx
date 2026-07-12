import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";

interface ImportWarningsProps {
  title?: string;
  warnings: string[];
}

export function ImportWarnings({ title = "Pontos para revisar", warnings }: ImportWarningsProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className={styles.warningPanel}>
      <p className={styles.warningTitle}>{title}</p>
      <ul className={styles.warningList}>
        {warnings.map((warning) => (
          <li key={warning}>- {warning}</li>
        ))}
      </ul>
    </div>
  );
}
