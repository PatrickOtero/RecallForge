import type { ImportCandidate } from "@/lib/questionnaire-import";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";

interface TrueFalseEditorProps {
  candidate: ImportCandidate;
  onChange: (updates: Partial<ImportCandidate>) => void;
}

export function TrueFalseEditor({ candidate, onChange }: TrueFalseEditorProps) {
  return (
    <div className={styles.editorGrid}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Afirmação</span>
        <textarea
          value={candidate.question ?? ""}
          onChange={(event) => onChange({ question: event.target.value })}
          className={styles.textarea}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Gabarito</span>
        <select
          value={candidate.answer ?? ""}
          onChange={(event) => onChange({ answer: event.target.value })}
          className={styles.select}
        >
          <option value="">Selecione</option>
          <option value="true">Verdadeiro</option>
          <option value="false">Falso</option>
        </select>
      </label>
    </div>
  );
}
