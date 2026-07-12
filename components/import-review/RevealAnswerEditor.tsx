import type { ImportCandidate } from "@/lib/questionnaire-import";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";

interface RevealAnswerEditorProps {
  answerLabel?: string;
  candidate: ImportCandidate;
  promptLabel?: string;
  onChange: (updates: Partial<ImportCandidate>) => void;
}

export function RevealAnswerEditor({
  answerLabel = "Resposta",
  candidate,
  promptLabel = "Pergunta",
  onChange,
}: RevealAnswerEditorProps) {
  return (
    <div className={styles.editorGrid}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{promptLabel}</span>
        <textarea
          value={candidate.question ?? ""}
          onChange={(event) => onChange({ question: event.target.value })}
          className={styles.textarea}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{answerLabel}</span>
        <textarea
          value={candidate.answer ?? ""}
          onChange={(event) => onChange({ answer: event.target.value })}
          className={styles.textarea}
        />
      </label>
    </div>
  );
}
