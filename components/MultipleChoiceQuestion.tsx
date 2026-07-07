"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { multipleChoiceQuestionStyles as styles } from "./MultipleChoiceQuestion.styles";

interface MultipleChoiceQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
  question: Question;
}

export function MultipleChoiceQuestion({
  attempt,
  disabled,
  onSubmit,
  question,
}: MultipleChoiceQuestionProps) {
  const [selected, setSelected] = useState(attempt?.responseText ?? "");

  return (
    <div className={styles.root}>
      <div className={styles.choices}>
        {question.choices?.map((choice) => {
          const active = selected === choice.label;

          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(choice.label)}
              className={styles.choiceButton({ active, disabled })}
            >
              {choice.label}
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
