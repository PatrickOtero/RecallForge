"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CircleX } from "lucide-react";

import type { AnswerAttempt, FlashcardRating, Question } from "@/lib/types";
import { flashcardQuestionStyles as styles } from "./FlashcardQuestion.styles";

interface FlashcardQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (rating: FlashcardRating) => void;
  question: Question;
}

const actions = [
  { label: "Errei", value: "MISS", icon: CircleX, tone: "miss" },
  { label: "Quase", value: "ALMOST", icon: Circle, tone: "almost" },
  { label: "Acertei", value: "GOT_IT", icon: CheckCircle2, tone: "gotIt" },
] as const;

export function FlashcardQuestion({
  attempt,
  disabled,
  onSubmit,
  question,
}: FlashcardQuestionProps) {
  const [revealed, setRevealed] = useState(Boolean(attempt));

  return (
    <div className={styles.root}>
      {!revealed ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setRevealed(true)}
          className={styles.revealButton}
        >
          Mostrar resposta
        </button>
      ) : null}

      {revealed ? (
        <div className={styles.answerPanel}>
          <div>
            <p className={styles.label}>Resposta</p>
            <p className={styles.answerText}>
              {question.expectedAnswer ?? "Sem resposta sugerida."}
            </p>
          </div>

          {question.referenceAnswer ? (
            <div className={styles.referenceBlock}>
              <p className={styles.label}>Trecho de apoio</p>
              <p className={styles.referenceText}>{question.referenceAnswer}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {revealed && !attempt ? (
        <div className={styles.actions}>
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.value}
                type="button"
                disabled={disabled}
                onClick={() => onSubmit(action.value)}
                className={styles.actionButton(action.tone)}
              >
                <Icon className={styles.actionIcon} />
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
