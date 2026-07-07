"use client";

import { useState } from "react";

import type { AnswerAttempt } from "@/lib/types";
import { fillBlankQuestionStyles as styles } from "./FillBlankQuestion.styles";

interface FillBlankQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
}

export function FillBlankQuestion({ attempt, disabled, onSubmit }: FillBlankQuestionProps) {
  const [value, setValue] = useState(attempt?.responseText ?? "");

  return (
    <div className={styles.root}>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Digite a palavra ou expressão que completa a ideia."
        className={styles.input}
      />

      {!attempt ? (
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={() => onSubmit(value)}
          className={styles.submitButton}
        >
          Conferir resposta
        </button>
      ) : null}
    </div>
  );
}
