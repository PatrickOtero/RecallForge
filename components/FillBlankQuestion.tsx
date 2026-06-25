"use client";

import { useState } from "react";

import type { AnswerAttempt } from "@/lib/types";

interface FillBlankQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
}

export function FillBlankQuestion({ attempt, disabled, onSubmit }: FillBlankQuestionProps) {
  const [value, setValue] = useState(attempt?.responseText ?? "");

  return (
    <div className="space-y-4">
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Digite a palavra ou expressão que completa a ideia."
        className="w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-80"
      />

      {!attempt ? (
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={() => onSubmit(value)}
          className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Conferir resposta
        </button>
      ) : null}
    </div>
  );
}
