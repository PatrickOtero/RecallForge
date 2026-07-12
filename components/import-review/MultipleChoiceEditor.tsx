import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";
import { createOptionId, ensureUniqueOptionIds } from "@/lib/questionnaire-import";
import type { ImportCandidate, ImportCandidateOption } from "@/lib/questionnaire-import";

interface MultipleChoiceEditorProps {
  candidate: ImportCandidate;
  onChange: (updates: Partial<ImportCandidate>) => void;
}

function buildDefaultOptions(candidateId: string): ImportCandidateOption[] {
  return [
    { id: createOptionId(candidateId), text: "" },
    { id: createOptionId(candidateId), text: "" },
  ];
}

function ensureOptions(candidate: ImportCandidate) {
  const prepared = ensureUniqueOptionIds({
    ...candidate,
    options: candidate.options && candidate.options.length > 0 ? candidate.options : buildDefaultOptions(candidate.id),
  });

  return prepared.candidate.options ?? buildDefaultOptions(candidate.id);
}

export function MultipleChoiceEditor({ candidate, onChange }: MultipleChoiceEditorProps) {
  const options = ensureOptions(candidate);

  function updateOption(optionId: string, text: string) {
    onChange({
      options: options.map((option) => (option.id === optionId ? { ...option, text } : option)),
    });
  }

  function setCorrectOption(optionId: string) {
    onChange({
      options: options.map((option) => ({
        ...option,
        isCorrect: option.id === optionId,
      })),
    });
  }

  function addOption() {
    onChange({
      options: [...options, { id: createOptionId(candidate.id), text: "" }],
    });
  }

  function removeOption(optionId: string) {
    onChange({
      options: options.filter((option) => option.id !== optionId),
    });
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Alternativas</span>
      <div className={styles.optionList}>
        {options.map((option) => (
          <div key={`${candidate.id}-${option.id}`} className={styles.optionRow}>
            <div className="flex items-center gap-3">
              {option.label ? <span className={styles.parserBadge}>{option.label}</span> : null}
              <input
                value={option.text}
                onChange={(event) => updateOption(option.id, event.target.value)}
                placeholder="Texto da alternativa"
                className={styles.input}
              />
            </div>
            <button
              type="button"
              onClick={() => setCorrectOption(option.id)}
              className={styles.optionToggle({ active: Boolean(option.isCorrect) })}
            >
              {option.isCorrect ? "Gabarito selecionado" : "Marcar como gabarito"}
            </button>
            <button
              type="button"
              onClick={() => removeOption(option.id)}
              className={styles.secondaryButton}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addOption} className={styles.secondaryButton}>
        Adicionar alternativa
      </button>
    </div>
  );
}
