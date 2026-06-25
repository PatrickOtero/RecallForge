"use client";

import { useState } from "react";

import type { AnswerAttempt } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TrueFalseQuestionProps {
  attempt?: AnswerAttempt;
  disabled: boolean;
  onSubmit: (responseText: string) => void;
}

const options = [
  { label: "Verdadeiro", value: "true" },
  { label: "Falso", value: "false" },
];

export function TrueFalseQuestion({
  attempt,
  disabled,
  onSubmit,
}: TrueFalseQuestionProps) {
  const [selected, setSelected] = useState(attempt?.responseText ?? "");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const active = selected === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(option.value)}
              className={cn(
                "rounded-3xl border px-4 py-4 text-left text-sm font-medium transition",
                active
                  ? "border-cyan-400 bg-cyan-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                disabled && "cursor-not-allowed opacity-80",
              )}
            >
              {option.label}
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
