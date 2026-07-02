"use client";

import { useState } from "react";
import { Brain, FileStack, Layers3, ScrollText, Wand2 } from "lucide-react";

import type { Document, QuizComposition, QuizMode, QuizModeOption } from "@/lib/types";
import {
  cn,
  formatCharacterCount,
  formatQuestionCount,
  getDocumentSourceLabel,
  getQuestionPresentationLabel,
  getQuizCompositionLabel,
} from "@/lib/utils";

interface QuizModeSelectorProps {
  document: Document;
  options: QuizModeOption[];
  isPending: boolean;
  onBack: () => void;
  onSelect: (mode: QuizMode, composition?: QuizComposition) => void;
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
  const [selectedMode, setSelectedMode] = useState<QuizMode | null>(options[0]?.mode ?? null);
  const [compositionByMode, setCompositionByMode] = useState<Partial<Record<QuizMode, QuizComposition>>>({});
  const activeMode = options.some((option) => option.mode === selectedMode) ? selectedMode : options[0]?.mode ?? null;
  const selectedOption = options.find((option) => option.mode === activeMode) ?? options[0];
  const selectedComposition =
    selectedOption?.compositionOptions.find(
      (option) => option.composition === compositionByMode[selectedOption.mode],
    ) ?? selectedOption?.compositionOptions[0];

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Modo de estudo</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{document.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Escolha o modo e depois defina como a rodada será composta.
            </p>
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
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {formatCharacterCount(document.cleanedText.length)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {options.map((option) => {
          const Icon = icons[option.mode];
          const active = selectedOption?.mode === option.mode;

          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => setSelectedMode(option.mode)}
              disabled={isPending}
              className={cn(
                "group rounded-[2rem] border p-6 text-left shadow-[0_25px_80px_rgba(15,23,42,0.08)] transition",
                active
                  ? "border-cyan-300 bg-white ring-4 ring-cyan-100"
                  : "border-white/70 bg-white/75 hover:-translate-y-1 hover:bg-white",
                isPending && "cursor-wait opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-[1.35rem] text-white shadow-lg shadow-slate-900/20 transition",
                    active ? "bg-cyan-600" : "bg-slate-900 group-hover:bg-cyan-600",
                  )}
                >
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
                {option.questionTypes.map((item) => (
                  <span key={`${option.mode}-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {getQuestionPresentationLabel(item)}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
                <span className="text-sm font-semibold text-slate-700">{formatQuestionCount(option.questionCount)}</span>
                <span className="text-sm font-semibold text-slate-900">
                  {active ? "Configurando" : "Selecionar"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedOption && selectedComposition ? (
        <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Composição</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{selectedOption.title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {selectedComposition.description}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Prévias</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {formatQuestionCount(selectedComposition.questionCount)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {selectedOption.compositionOptions.map((option) => {
              const active = selectedComposition.composition === option.composition;
              const disabled = option.locked || isPending;

              return (
                <button
                  key={`${selectedOption.mode}-${option.composition}`}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setCompositionByMode((previous) => ({
                      ...previous,
                      [selectedOption.mode]: option.composition,
                    }))
                  }
                  className={cn(
                    "rounded-[1.5rem] border px-4 py-4 text-left transition",
                    active
                      ? "border-cyan-300 bg-cyan-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                    disabled && "cursor-not-allowed opacity-80",
                  )}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {option.locked ? `${getQuizCompositionLabel(option.composition)} (fixo)` : option.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {option.questionTypes.map((type) => (
                      <span key={`${option.composition}-${type}`} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {getQuestionPresentationLabel(type)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-500">
              {selectedOption.mode === "FEYNMAN"
                ? "O modo Feynman permanece sempre discursivo."
                : selectedOption.mode === "FLASHCARDS"
                  ? "Flashcards mantêm o formato fixo de frente e verso."
                  : `Composição selecionada: ${getQuizCompositionLabel(selectedComposition.composition)}.`}
            </div>
            <button
              type="button"
              onClick={() => onSelect(selectedOption.mode, selectedComposition.composition)}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending ? "Preparando..." : "Iniciar rodada"}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onBack}
        className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
      >
        Voltar ao início
      </button>
    </div>
  );
}
