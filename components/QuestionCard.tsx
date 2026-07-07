import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { getQuestionPresentationLabel } from "@/lib/utils";
import { questionCardStyles as styles } from "./QuestionCard.styles";

interface QuestionCardProps {
  attempt?: AnswerAttempt;
  children: ReactNode;
  question: Question;
  showImmediateFeedback: boolean;
}

export function QuestionCard({ attempt, children, question, showImmediateFeedback }: QuestionCardProps) {
  const answered = Boolean(attempt);
  const isSelfAssessed = Boolean(attempt?.selfAssessment);
  const isPositive = (attempt?.score ?? 0) >= 0.7;

  return (
    <div className={styles.root}>
      <div className={styles.badges}>
        <span className={styles.typeBadge}>
          {getQuestionPresentationLabel(question.type, question.responseFormat)}
        </span>
        <span className={styles.topicBadge}>{question.topic}</span>
      </div>

      <div className={styles.header}>
        <p className={styles.eyebrow}>
          Pergunta {question.position}
        </p>
        <h3 className={styles.prompt}>{question.prompt}</h3>
      </div>

      <div className={styles.body}>{children}</div>

      {answered ? (
        <div className={styles.feedbackPanel({ isPositive, showImmediateFeedback })}>
          <div className={styles.feedbackContent}>
            {showImmediateFeedback ? (
              isPositive ? (
                <CheckCircle2 className={styles.positiveIcon} />
              ) : (
                <CircleAlert className={styles.reviewIcon} />
              )
            ) : (
              <Clock3 className={styles.pendingIcon} />
            )}

            <div className={styles.feedbackText}>
              <p className={styles.feedbackTitle}>
                {isSelfAssessed
                  ? "Autoavaliação registrada"
                  : showImmediateFeedback
                    ? isPositive
                      ? "Boa resposta"
                      : "Vale revisar este ponto"
                    : "Resposta guardada"}
              </p>
              <p className={styles.feedbackParagraph}>
                {isSelfAssessed
                  ? attempt?.feedback ?? "Sua autoavaliação foi guardada."
                  : showImmediateFeedback
                    ? attempt?.feedback ?? "Resposta recebida."
                    : "Sua resposta fica guardada e o resultado aparece no final da rodada."}
              </p>
              {showImmediateFeedback && question.expectedAnswer ? (
                <p className={styles.feedbackParagraph}>
                  <span className={styles.feedbackLabel}>Resposta esperada:</span>{" "}
                  {question.expectedAnswer}
                </p>
              ) : null}
              {showImmediateFeedback && question.referenceAnswer ? (
                <p className={styles.feedbackParagraph}>
                  <span className={styles.feedbackLabel}>Trecho de apoio:</span>{" "}
                  {question.referenceAnswer}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
