"use client";

import { useState } from "react";

import type { AnswerAttempt } from "@/lib/types";
import { shortAnswerQuestionStyles as styles } from "./ShortAnswerQuestion.styles";

interface ShortAnswerQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
}

export function ShortAnswerQuestion({
  attempt,
  disabled,
  onSubmit,
}: ShortAnswerQuestionProps) {
  const [value, setValue] = useState(attempt?.responseText ?? "");

  return (
    <div className={styles.root}>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Responda de forma curta e direta."
        className={styles.textarea}
      />

      {!attempt ? (
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={() => onSubmit(value)}
          className={styles.submitButton}
        >
          Salvar resposta
        </button>
      ) : null}
    </div>
  );
}
