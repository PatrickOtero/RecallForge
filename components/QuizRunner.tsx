"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";

import { DiscursiveQuestion } from "@/components/DiscursiveQuestion";
import { FillBlankQuestion } from "@/components/FillBlankQuestion";
import { FlashcardQuestion } from "@/components/FlashcardQuestion";
import { MultipleChoiceQuestion } from "@/components/MultipleChoiceQuestion";
import { QuestionCard } from "@/components/QuestionCard";
import { QuizProgress } from "@/components/QuizProgress";
import { TrueFalseQuestion } from "@/components/TrueFalseQuestion";
import type {
  AnswerAttempt,
  CompleteQuizSessionResponse,
  FlashcardRating,
  QuizResultSummary,
  QuizSession,
  SubmitAnswerResponse,
} from "@/lib/types";

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
      setError(data.error ?? "Nao conseguimos guardar sua resposta.");
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
      setError(data.error ?? "Nao conseguimos fechar essa rodada.");
      return;
    }

    onComplete(data.summary);
  }

  function renderQuestion() {
    if (!currentQuestion) {
      return null;
    }

    if (currentQuestion.type === "MULTIPLE_CHOICE") {
      return (
        <MultipleChoiceQuestion
          key={currentQuestion.id}
          attempt={currentAttempt}
          disabled={isSubmitting || Boolean(currentAttempt)}
          onSubmit={(responseText) => submitAnswer({ responseText })}
          question={currentQuestion}
        />
      );
    }

    if (currentQuestion.type === "TRUE_FALSE") {
      return (
        <TrueFalseQuestion
          key={currentQuestion.id}
          attempt={currentAttempt}
          disabled={isSubmitting || Boolean(currentAttempt)}
          onSubmit={(responseText) => submitAnswer({ responseText })}
        />
      );
    }

    if (currentQuestion.type === "FILL_BLANK") {
      return (
        <FillBlankQuestion
          key={currentQuestion.id}
          attempt={currentAttempt}
          disabled={isSubmitting || Boolean(currentAttempt)}
          onSubmit={(responseText) => submitAnswer({ responseText })}
        />
      );
    }

    if (currentQuestion.type === "FLASHCARD") {
      return (
        <FlashcardQuestion
          key={currentQuestion.id}
          attempt={currentAttempt}
          disabled={isSubmitting || Boolean(currentAttempt)}
          onSubmit={(selfAssessment) => submitAnswer({ selfAssessment })}
          question={currentQuestion}
        />
      );
    }

    return (
      <DiscursiveQuestion
        key={currentQuestion.id}
        attempt={currentAttempt}
        disabled={isSubmitting || Boolean(currentAttempt)}
        onSubmit={(responseText) => submitAnswer({ responseText })}
        question={currentQuestion}
      />
    );
  }

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {session.generationNote ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {session.generationNote}
          </div>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao inicio
        </button>
      </div>

      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <QuizProgress
          current={currentIndex + (currentAttempt ? 1 : 0)}
          total={session.questionCount}
          label={session.title}
        />
      </div>

      <QuestionCard
        attempt={currentAttempt}
        question={currentQuestion}
        showImmediateFeedback={session.mode !== "EXAM"}
      >
        {renderQuestion()}
      </QuestionCard>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {isSubmitting ? (
        <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Guardando resposta...
        </div>
      ) : null}

      {currentAttempt ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          {!isLastQuestion ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((value) => value + 1)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
            >
              Proxima pergunta
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finishSession}
              disabled={isCompleting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
            >
              {isCompleting ? "Fechando rodada..." : "Ver resultado final"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
