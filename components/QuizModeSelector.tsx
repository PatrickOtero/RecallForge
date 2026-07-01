"use client";

import { Brain, FileStack, Layers3, ScrollText, Wand2 } from "lucide-react";

import type { Document, QuizMode, QuizModeOption } from "@/lib/types";
import {
  cn,
  formatCharacterCount,
  formatQuestionCount,
  getDocumentSourceLabel,
} from "@/lib/utils";

interface QuizModeSelectorProps {
  document: Document;
  options: QuizModeOption[];
  isPending: boolean;
  onBack: () => void;
  onSelect: (mode: QuizMode) => void;
}

const icons = {
  QUICK_REVIEW: Layers3,
  DEEP_DIVE: Brain,
  EXAM: ScrollText,
  FEYNMAN: Wand2,
  FLASHCARDS: FileStack,
} as const;

export function QuizModeSelector({
  document,
  options,
  isPending,
  onBack,
  onSelect,
}: QuizModeSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Modo de estudo</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{document.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Escolha como voce quer responder este material.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Origem</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{getDocumentSourceLabel(document.sourceType)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Partes</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{document.chunkCount}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Texto</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{formatCharacterCount(document.cleanedText.length)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {options.map((option) => {
          const Icon = icons[option.mode];

          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onSelect(option.mode)}
              disabled={isPending}
              className={cn(
                "group rounded-[2rem] border border-white/70 bg-white/75 p-6 text-left shadow-[0_25px_80px_rgba(15,23,42,0.08)] transition",
                "hover:-translate-y-1 hover:bg-white disabled:cursor-wait disabled:opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[1.35rem] bg-slate-900 text-white shadow-lg shadow-slate-900/20 transition group-hover:bg-cyan-600">
                  <Icon className="h-6 w-6" />
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    option.immediateFeedback ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                  )}
                >
                  {option.immediateFeedback ? "Corrige na hora" : "Resultado no final"}
                </span>
              </div>

              <div className="mt-6">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{option.title}</h3>
                <p className="mt-2 text-sm font-medium text-cyan-700">{option.tagline}</p>
                <p className="mt-3 text-sm leading-6 text-slate-500">{option.description}</p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {option.emphasis.map((item) => (
                  <span key={`${option.mode}-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
                <span className="text-sm font-semibold text-slate-700">{formatQuestionCount(option.questionCount)}</span>
                <span className="text-sm font-semibold text-slate-900">{isPending ? "Preparando..." : "Gerar"}</span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
      >
        Trocar material
      </button>
    </div>
  );
}
