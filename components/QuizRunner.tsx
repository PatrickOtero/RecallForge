"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";

import { QuestionCard } from "@/components/QuestionCard";
import { QuizProgress } from "@/components/QuizProgress";
import { QuestionRenderer } from "@/components/quiz-renderers/QuestionRenderer";
import type {
  AnswerAttempt,
  CompleteQuizSessionResponse,
  FlashcardRating,
  QuizResultSummary,
  QuizSession,
  SubmitAnswerResponse,
} from "@/lib/types";
import { quizRunnerStyles as styles } from "./QuizRunner.styles";

interface QuizRunnerProps {
  onComplete: (summary: QuizResultSummary) => void;
  onExit: () => void;
  session: QuizSession;
}

type AttemptMap = Record<string, AnswerAttempt>;

export function QuizRunner({ onComplete, onExit, session }: QuizRunnerProps) {
  const [attempts, setAttempts] = useState<AttemptMap>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const currentQuestion = session.questions[currentIndex];
  const currentAttempt = currentQuestion ? attempts[currentQuestion.id] : undefined;
  const isLastQuestion = currentIndex === session.questions.length - 1;

  async function submitAnswer(payload: { responseText?: string; selfAssessment?: FlashcardRating }) {
    if (!currentQuestion) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/quiz-sessions/${session.id}/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        ...payload,
      }),
    });

    const data = (await response.json()) as SubmitAnswerResponse & { error?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Não conseguimos guardar sua resposta.");
      return;
    }

    setAttempts((previous) => ({
      ...previous,
      [currentQuestion.id]: data.attempt,
    }));
  }

  async function finishSession() {
    setError(null);
    setIsCompleting(true);

    const response = await fetch(`/api/quiz-sessions/${session.id}/complete`, {
      method: "POST",
    });

    const data = (await response.json()) as CompleteQuizSessionResponse & { error?: string };
    setIsCompleting(false);

    if (!response.ok) {
      setError(data.error ?? "Não conseguimos fechar essa rodada.");
      return;
    }

    onComplete(data.summary);
  }

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        {session.generationNote ? (
          <div className={styles.generationNote}>{session.generationNote}</div>
        ) : (
          <div />
        )}

        <button type="button" onClick={onExit} className={styles.exitButton}>
          <ArrowLeft className={styles.icon} />
          Voltar ao início
        </button>
      </div>

      <div className={styles.progressCard}>
        <QuizProgress
          current={currentIndex + (currentAttempt ? 1 : 0)}
          total={session.questionCount}
          label={session.title}
        />
      </div>

      <QuestionCard
        attempt={currentAttempt}
        question={currentQuestion}
        showImmediateFeedback
      >
        <QuestionRenderer
          key={currentQuestion.id}
          attempt={currentAttempt}
          disabled={isSubmitting || Boolean(currentAttempt)}
          onSubmit={submitAnswer}
          question={currentQuestion}
        />
      </QuestionCard>

      {error ? <div className={styles.error}>{error}</div> : null}

      {isSubmitting ? (
        <div className={styles.submittingNotice}>
          <LoaderCircle className={styles.spinner} />
          Guardando resposta...
        </div>
      ) : null}

      {currentAttempt ? (
        <div className={styles.actions}>
          {!isLastQuestion ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((value) => value + 1)}
              className={styles.nextButton}
            >
              Próxima pergunta
              <ArrowRight className={styles.icon} />
            </button>
          ) : (
            <button
              type="button"
              onClick={finishSession}
              disabled={isCompleting}
              className={styles.finishButton}
            >
              {isCompleting ? "Fechando rodada..." : "Ver resultado final"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
