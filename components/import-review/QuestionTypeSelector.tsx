import type { ImportDetectedType } from "@/lib/questionnaire-import";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";

interface QuestionTypeSelectorProps {
  value: ImportDetectedType;
  onChange: (value: ImportDetectedType) => void;
}

const options: Array<{ label: string; value: ImportDetectedType }> = [
  { value: "MULTIPLE_CHOICE", label: "Multipla escolha" },
  { value: "MULTI_SELECT", label: "Multipla selecao" },
  { value: "STATEMENT_JUDGEMENT", label: "Julgamento por itens" },
  { value: "TRUE_FALSE", label: "Verdadeiro/Falso" },
  { value: "MATCHING", label: "Associacao" },
  { value: "REVEAL_ANSWER", label: "Revelar resposta" },
  { value: "FLASHCARD", label: "Flashcard" },
  { value: "FILL_BLANK", label: "Lacuna" },
  { value: "UNKNOWN", label: "Desconhecido" },
];

export function QuestionTypeSelector({ value, onChange }: QuestionTypeSelectorProps) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>Tipo</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ImportDetectedType)}
        className={styles.select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
