"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { matchingQuestionStyles as styles } from "./MatchingQuestion.styles";

interface MatchingQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
  question: Question;
}

function shuffleValues(values: string[]) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  }

  return result;
}

function parseSelection(value: string | null) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    return {};
  }
}

export function MatchingQuestion({ attempt, disabled, onSubmit, question }: MatchingQuestionProps) {
  const pairs = question.matchingPairs ?? [];
  const [options] = useState(() => shuffleValues(pairs.map((pair) => pair.right)));
  const [selected, setSelected] = useState<Record<string, string>>(() => parseSelection(attempt?.responseText ?? null));

  const usedValues = new Set(Object.values(selected).filter(Boolean));
  const complete = pairs.length > 0 && pairs.every((pair) => selected[pair.id]);

  function updateSelection(pairId: string, value: string) {
    setSelected((previous) => ({
      ...previous,
      [pairId]: value,
    }));
  }

  return (
    <div className={styles.root}>
      <div className={styles.pairs}>
        {pairs.map((pair) => {
          const currentValue = selected[pair.id] ?? "";
          const isCorrect = attempt ? currentValue === pair.right : null;

          return (
            <div key={pair.id} className={styles.pairRow}>
              <div className={styles.pairLabel}>{pair.left}</div>
              <div className={styles.controls}>
                <select
                  value={currentValue}
                  disabled={disabled}
                  onChange={(event) => updateSelection(pair.id, event.target.value)}
                  className={styles.select}
                >
                  <option value="">Escolha a associação</option>
                  {options.map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={usedValues.has(option) && currentValue !== option}
                    >
                      {option}
                    </option>
                  ))}
                </select>

                {attempt ? (
                  <p className={styles.feedback(Boolean(isCorrect))}>
                    {isCorrect ? "Correto" : `Correto: ${pair.right}`}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!attempt ? (
        <div className={styles.actions}>
          <button
            type="button"
            disabled={disabled || !complete}
            onClick={() => onSubmit(JSON.stringify(selected))}
            className={styles.submitButton}
          >
            Confirmar associações
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSelected({})}
            className={styles.clearButton}
          >
            Limpar
          </button>
        </div>
      ) : null}
    </div>
  );
}
