"use client";

import { useState } from "react";

import type { AnswerAttempt, Question } from "@/lib/types";

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
    <div className="space-y-5">
      <div className="grid gap-3">
        {pairs.map((pair) => {
          const currentValue = selected[pair.id] ?? "";
          const isCorrect = attempt ? currentValue === pair.right : null;

          return (
            <div
              key={pair.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] md:items-center"
            >
              <div className="text-sm font-semibold leading-6 text-slate-800">{pair.left}</div>
              <div className="space-y-2">
                <select
                  value={currentValue}
                  disabled={disabled}
                  onChange={(event) => updateSelection(pair.id, event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-80"
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
                  <p className={isCorrect ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-rose-700"}>
                    {isCorrect ? "Correto" : `Correto: ${pair.right}`}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!attempt ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={disabled || !complete}
            onClick={() => onSubmit(JSON.stringify(selected))}
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Confirmar associações
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSelected({})}
            className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpar
          </button>
        </div>
      ) : null}
    </div>
  );
}
