"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { safeJsonParse } from "@/lib/utils";
import { multiSelectQuestionStyles as styles } from "./MultiSelectQuestion.styles";

interface MultiSelectQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
  question: Question;
}

function parseAttemptSelection(value: string | null | undefined) {
  return safeJsonParse<string[]>(value, []);
}

export function MultiSelectQuestion({
  attempt,
  disabled,
  onSubmit,
  question,
}: MultiSelectQuestionProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => parseAttemptSelection(attempt?.responseText));
  const selected = new Set(selectedIds);

  function toggleOption(optionId: string) {
    setSelectedIds((current) =>
      current.includes(optionId)
        ? current.filter((item) => item !== optionId)
        : [...current, optionId],
    );
  }

  return (
    <div className={styles.root}>
      <p className={styles.helperText}>Selecione todas as alternativas corretas antes de confirmar.</p>

      <div className={styles.choices}>
        {question.choices?.map((choice) => {
          const active = selected.has(choice.id);

          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(choice.id)}
              className={styles.choiceButton({ active, disabled })}
            >
              <div className={styles.choiceRow}>
                <span className={styles.marker({ active })}>✓</span>
                <span>{choice.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {!attempt ? (
        <div className={styles.actions}>
          <button
            type="button"
            disabled={disabled || selectedIds.length === 0}
            onClick={() => onSubmit(JSON.stringify(selectedIds))}
            className={styles.submitButton}
          >
            Confirmar respostas
          </button>
          <button
            type="button"
            disabled={disabled || selectedIds.length === 0}
            onClick={() => setSelectedIds([])}
            className={styles.clearButton}
          >
            Limpar seleção
          </button>
        </div>
      ) : null}
    </div>
  );
}
