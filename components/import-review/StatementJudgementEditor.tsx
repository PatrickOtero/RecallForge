import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";
import { createOptionId, ensureUniqueOptionIds } from "@/lib/questionnaire-import";
import type { ImportCandidate, ImportCandidateOption } from "@/lib/questionnaire-import";

interface StatementJudgementEditorProps {
  candidate: ImportCandidate;
  onChange: (updates: Partial<ImportCandidate>) => void;
}

const defaultLabels = ["01", "02", "04", "08", "16"];

function buildDefaultOptions(candidateId: string): ImportCandidateOption[] {
  return defaultLabels.map((label) => ({
    id: createOptionId(candidateId),
    label,
    text: "",
    isCorrect: false,
  }));
}

function ensureOptions(candidate: ImportCandidate) {
  const prepared = ensureUniqueOptionIds({
    ...candidate,
    options: candidate.options && candidate.options.length > 0 ? candidate.options : buildDefaultOptions(candidate.id),
  });

  return prepared.candidate.options ?? buildDefaultOptions(candidate.id);
}

export function StatementJudgementEditor({ candidate, onChange }: StatementJudgementEditorProps) {
  const options = ensureOptions(candidate);

  function updateOption(optionId: string, text: string) {
    onChange({
      options: options.map((option) => (option.id === optionId ? { ...option, text } : option)),
    });
  }

  function toggleTruth(optionId: string) {
    onChange({
      options: options.map((option) =>
        option.id === optionId
          ? { ...option, isCorrect: !option.isCorrect }
          : option,
      ),
    });
  }

  function addStatement() {
    const nextLabel = String((options.length + 1) * 2).padStart(2, "0");
    onChange({
      options: [...options, { id: createOptionId(candidate.id), label: nextLabel, text: "", isCorrect: false }],
    });
  }

  function removeStatement(optionId: string) {
    onChange({
      options: options.filter((option) => option.id !== optionId),
    });
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Afirmacoes</span>
      <div className={styles.optionList}>
        {options.map((option) => (
          <div key={`${candidate.id}-${option.id}`} className={styles.optionRow}>
            <div className="flex items-center gap-3">
              <span className={styles.parserBadge}>{option.label ?? "--"}</span>
              <input
                value={option.text}
                onChange={(event) => updateOption(option.id, event.target.value)}
                placeholder="Texto da afirmacao"
                className={styles.input}
              />
            </div>
            <button
              type="button"
              onClick={() => toggleTruth(option.id)}
              className={styles.optionToggle({ active: Boolean(option.isCorrect) })}
            >
              {option.isCorrect ? "Verdadeira no gabarito" : "Marcar como verdadeira"}
            </button>
            <button
              type="button"
              onClick={() => removeStatement(option.id)}
              className={styles.secondaryButton}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addStatement} className={styles.secondaryButton}>
        Adicionar afirmacao
      </button>
    </div>
  );
}
