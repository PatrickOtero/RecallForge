"use client";

import { useState } from "react";

import type { AnswerAttempt } from "@/lib/types";
import { trueFalseQuestionStyles as styles } from "./TrueFalseQuestion.styles";

interface TrueFalseQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
}

const options = [
  { label: "Verdadeiro", value: "true" },
  { label: "Falso", value: "false" },
];

export function TrueFalseQuestion({
  attempt,
  disabled,
  onSubmit,
}: TrueFalseQuestionProps) {
  const [selected, setSelected] = useState(attempt?.responseText ?? "");

  return (
    <div className={styles.root}>
      <div className={styles.options}>
        {options.map((option) => {
          const active = selected === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(option.value)}
              className={styles.optionButton({ active, disabled })}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {!attempt ? (
        <button
          type="button"
          disabled={disabled || !selected}
          onClick={() => onSubmit(selected)}
          className={styles.submitButton}
        >
          Confirmar resposta
        </button>
      ) : null}
    </div>
  );
}
