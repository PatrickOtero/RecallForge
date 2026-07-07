"use client";

import type { Document, QuizMode, QuizModeOption } from "@/lib/types";
import { formatCharacterCount, getDocumentSourceLabel } from "@/lib/utils";
import { StudyModeGrid } from "@/components/study-mode/StudyModeGrid";
import { quizModeSelectorStyles as styles } from "./QuizModeSelector.styles";

interface QuizModeSelectorProps {
  document: Document;
  options: QuizModeOption[];
  isPending: boolean;
  onBack: () => void;
  onSelect: (mode: QuizMode) => void;
}

export function QuizModeSelector({
  document,
  options,
  isPending,
  onBack,
  onSelect,
}: QuizModeSelectorProps) {
  return (
    <div className={styles.root}>
      <div className={styles.summaryCard}>
        <div className={styles.summaryLayout}>
          <div>
            <p className={styles.eyebrow}>Modo de estudo</p>
            <h2 className={styles.title}>{document.title}</h2>
            <p className={styles.description}>
              Escolha um modo claro e direto para este questionário.
            </p>
          </div>
          <div className={styles.metadataGrid}>
            <div className={styles.metadataCard}>
              <p className={styles.metadataLabel}>Origem</p>
              <p className={styles.metadataValue}>{getDocumentSourceLabel(document.sourceType)}</p>
            </div>
            <div className={styles.metadataCard}>
              <p className={styles.metadataLabel}>Partes</p>
              <p className={styles.metadataValue}>{document.chunkCount}</p>
            </div>
            <div className={styles.metadataCard}>
              <p className={styles.metadataLabel}>Texto</p>
              <p className={styles.metadataValue}>
                {formatCharacterCount(document.cleanedText.length)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <StudyModeGrid isPending={isPending} options={options} onStart={onSelect} />

      <button type="button" onClick={onBack} className={styles.backButton}>
        Voltar ao início
      </button>
    </div>
  );
}
