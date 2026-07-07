"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { discursiveQuestionStyles as styles } from "./DiscursiveQuestion.styles";

interface DiscursiveQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
  question: Question;
}

export function DiscursiveQuestion({
  attempt,
  disabled,
  onSubmit,
  question,
}: DiscursiveQuestionProps) {
  const [value, setValue] = useState(attempt?.responseText ?? "");

  return (
    <div className={styles.root}>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Explique com suas palavras, com contexto e exemplos simples quando fizer sentido."
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

      {question.rubric ? (
        <div className={styles.rubric}>
          <span className={styles.rubricLabel}>Pontos que vale mencionar:</span> {question.rubric}
        </div>
      ) : null}
    </div>
  );
}
