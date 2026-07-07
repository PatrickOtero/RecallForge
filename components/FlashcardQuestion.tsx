"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CircleX } from "lucide-react";

import type { AnswerAttempt, FlashcardRating, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FlashcardQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (rating: FlashcardRating) => void;
  question: Question;
}

const actions = [
  { label: "Errei", value: "MISS", icon: CircleX, classes: "bg-rose-50 text-rose-700" },
  { label: "Quase", value: "ALMOST", icon: Circle, classes: "bg-amber-50 text-amber-700" },
  { label: "Acertei", value: "GOT_IT", icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700" },
] as const;

export function FlashcardQuestion({
  attempt,
  disabled,
  onSubmit,
  question,
}: FlashcardQuestionProps) {
  const [revealed, setRevealed] = useState(Boolean(attempt));

  return (
    <div className="space-y-4">
      {!revealed ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setRevealed(true)}
          className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mostrar resposta
        </button>
      ) : null}

      {revealed ? (
        <div className="space-y-3 rounded-[1.75rem] border border-cyan-100 bg-cyan-50/80 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">Resposta</p>
            <p className="mt-3 text-sm leading-7 text-slate-700">
              {question.expectedAnswer ?? "Sem resposta sugerida."}
            </p>
          </div>

          {question.referenceAnswer ? (
            <div className="border-t border-cyan-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">Trecho de apoio</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">{question.referenceAnswer}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {revealed && !attempt ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.value}
                type="button"
                disabled={disabled}
                onClick={() => onSubmit(action.value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-3xl px-4 py-4 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
                  action.classes,
                )}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
