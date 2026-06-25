"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    <div className="space-y-4">
      <div className="grid gap-3">
        {question.choices?.map((choice) => {
          const active = selected === choice.label;

          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(choice.label)}
              className={cn(
                "rounded-3xl border px-4 py-4 text-left text-sm font-medium transition",
                active
                  ? "border-cyan-400 bg-cyan-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                disabled && "cursor-not-allowed opacity-80",
              )}
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
          className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Confirmar resposta
        </button>
      ) : null}
    </div>
  );
}
