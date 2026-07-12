import type { ImportCandidate, ImportCandidatePair } from "@/lib/questionnaire-import";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";

interface MatchingEditorProps {
  candidate: ImportCandidate;
  onChange: (updates: Partial<ImportCandidate>) => void;
}

function ensurePairs(pairs: ImportCandidatePair[] | undefined) {
  return pairs && pairs.length > 0 ? pairs : [{ left: "", right: "" }, { left: "", right: "" }];
}

export function MatchingEditor({ candidate, onChange }: MatchingEditorProps) {
  const pairs = ensurePairs(candidate.matchingPairs);

  function updatePair(index: number, side: "left" | "right", value: string) {
    onChange({
      matchingPairs: pairs.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, [side]: value } : pair,
      ),
    });
  }

  function addPair() {
    onChange({
      matchingPairs: [...pairs, { left: "", right: "" }],
    });
  }

  function removePair(index: number) {
    onChange({
      matchingPairs: pairs.filter((_, pairIndex) => pairIndex !== index),
    });
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Pares de associação</span>
      <div className={styles.optionList}>
        {pairs.map((pair, index) => (
          <div key={`${pair.left}-${pair.right}-${index}`} className={styles.pairRow}>
            <input
              value={pair.left}
              onChange={(event) => updatePair(index, "left", event.target.value)}
              placeholder="Item"
              className={styles.input}
            />
            <input
              value={pair.right}
              onChange={(event) => updatePair(index, "right", event.target.value)}
              placeholder="Resposta"
              className={styles.input}
            />
            <button
              type="button"
              onClick={() => removePair(index)}
              className={styles.secondaryButton}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addPair} className={styles.secondaryButton}>
        Adicionar par
      </button>
    </div>
  );
}
