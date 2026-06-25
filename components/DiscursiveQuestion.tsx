"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";

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
    <div className="space-y-4">
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Escreva uma explicação curta com suas palavras."
        className="min-h-48 w-full resize-none rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-80"
      />

      {!attempt ? (
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={() => onSubmit(value)}
          className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Salvar resposta
        </button>
      ) : null}

      {question.rubric ? (
        <div className="rounded-3xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
          <span className="font-semibold text-slate-700">Pontos que vale mencionar:</span> {question.rubric}
        </div>
      ) : null}
    </div>
  );
}
