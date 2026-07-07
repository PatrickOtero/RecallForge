"use client";

import { ArrowRight, Gauge, RotateCcw, Sparkles } from "lucide-react";

import type { QuizResultSummary as QuizResult, QuizSession } from "@/lib/types";

interface QuizResultSummaryProps {
  session: QuizSession;
  summary: QuizResult;
  onBackToModes: () => void;
  onRestartSameMode: () => void;
  onStartOver: () => void;
}

export function QuizResultSummary({
  session,
  summary,
  onBackToModes,
  onRestartSameMode,
  onStartOver,
}: QuizResultSummaryProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Resultado final</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{session.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Veja onde você foi bem e quais pontos merecem uma revisão mais atenta.
            </p>
          </div>

          <div className="flex h-40 w-40 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,#67e8f9,transparent_55%),linear-gradient(135deg,#0f172a,#155e75)] text-white shadow-[0_20px_60px_rgba(8,145,178,0.35)]">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-100">Nota</p>
              <p className="mt-2 text-5xl font-semibold">{summary.score}</p>
            </div>
          </div>
        </div>
      </div>

      {session.generationNote ? (
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
          {session.generationNote}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/15">
          <Gauge className="h-5 w-5 text-cyan-300" />
          <p className="mt-4 text-sm text-slate-300">Acertos</p>
          <p className="mt-2 text-3xl font-semibold">{summary.correctCount}</p>
        </div>
        <div className="rounded-[1.75rem] bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-slate-500">Erros</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{summary.wrongCount}</p>
        </div>
        <div className="rounded-[1.75rem] bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-slate-500">Perguntas</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{session.questionCount}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.75rem] bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Pontos para revisar</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.weakTopics.length > 0 ? (
              summary.weakTopics.map((topic) => (
                <span key={topic} className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
                  {topic}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                Nenhum ponto ficou muito frágil nesta rodada
              </span>
            )}
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-cyan-600" />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Próximos passos</p>
          </div>
          <div className="mt-4 space-y-3">
            {summary.recommendations.map((recommendation) => (
              <div key={recommendation} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                <ArrowRight className="mt-1 h-4 w-4 flex-none text-cyan-600" />
                {recommendation}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onBackToModes}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          Tentar outro modo com este material
        </button>
        <button
          type="button"
          onClick={onRestartSameMode}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
        >
          <RotateCcw className="h-4 w-4" />
          Refazer este questionário
        </button>
        <button
          type="button"
          onClick={onBackToModes}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
        >
          Voltar aos modos de estudo
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
        >
          Estudar outro material
        </button>
      </div>
    </div>
  );
}
