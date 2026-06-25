"use client";

import { useState, useTransition } from "react";
import { BookOpenText, Clock3, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { QuizModeSelector } from "@/components/QuizModeSelector";
import { QuizResultSummary } from "@/components/QuizResultSummary";
import { QuizRunner } from "@/components/QuizRunner";
import { UploadStudyMaterial } from "@/components/UploadStudyMaterial";
import type {
  CreateQuizSessionResponse,
  Document,
  IngestDocumentResponse,
  QuizModeOption,
  QuizResultSummary as QuizSummary,
  QuizSession,
  RecentSessionSummary,
} from "@/lib/types";
import { formatScore, getQuizModeLabel } from "@/lib/utils";

interface StudyWorkspaceProps {
  recentSessions: RecentSessionSummary[];
}

export function StudyWorkspace({ recentSessions }: StudyWorkspaceProps) {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "modes" | "quiz" | "result">("input");
  const [document, setDocument] = useState<Document | null>(null);
  const [options, setOptions] = useState<QuizModeOption[]>([]);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [isModePending, startModeTransition] = useTransition();
  const [isAnalysisPending, startAnalysisTransition] = useTransition();
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  function handleAnalyzeSuccess(payload: IngestDocumentResponse) {
    startAnalysisTransition(() => {
      setDocument(payload.document);
      setOptions(payload.options);
      setSummary(null);
      setSession(null);
      setFlowError(null);
      setStep("modes");
    });
  }

  async function handleModeSelect(mode: QuizModeOption["mode"]) {
    if (!document) {
      return;
    }

    setFlowError(null);
    setIsCreatingSession(true);

    const response = await fetch("/api/quiz-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentId: document.id,
        mode,
      }),
    });

    const payload = (await response.json()) as CreateQuizSessionResponse & { error?: string };
    setIsCreatingSession(false);

    if (!response.ok) {
      setFlowError(payload.error ?? "Nao foi possivel abrir essa rodada de estudo.");
      return;
    }

    startModeTransition(() => {
      setSession({
        ...payload.session,
        generationNote: payload.generationNote,
      });
      setStep("quiz");
    });
  }

  function handleRetrySameMode() {
    if (!session) {
      return;
    }

    void handleModeSelect(session.mode);
  }

  function handleBackToModes() {
    setFlowError(null);
    setSession(null);
    setSummary(null);
    setStep("modes");
  }

  function resetFlow() {
    setDocument(null);
    setOptions([]);
    setSession(null);
    setSummary(null);
    setFlowError(null);
    setStep("input");
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <section className="space-y-6">
        <div className="rounded-[2.25rem] border border-white/70 bg-white/70 p-6 shadow-[0_35px_120px_rgba(15,23,42,0.10)] backdrop-blur md:p-8">
          {step === "input" ? (
            <UploadStudyMaterial isPending={isAnalysisPending} onSuccess={handleAnalyzeSuccess} />
          ) : null}

          {step === "modes" && document ? (
            <div className="space-y-4">
              {flowError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {flowError}
                </div>
              ) : null}
              <QuizModeSelector
                document={document}
                options={options}
                isPending={isModePending || isCreatingSession}
                onBack={resetFlow}
                onSelect={handleModeSelect}
              />
            </div>
          ) : null}

          {step === "quiz" && session ? (
            <QuizRunner
              session={session}
              onComplete={(result) => {
                setSummary(result);
                setStep("result");
                router.refresh();
              }}
            />
          ) : null}

          {step === "result" && session && summary ? (
            <QuizResultSummary
              onBackToModes={handleBackToModes}
              onRestartSameMode={handleRetrySameMode}
              onStartOver={resetFlow}
              session={session}
              summary={summary}
            />
          ) : null}
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2.25rem] border border-white/70 bg-[linear-gradient(160deg,rgba(15,23,42,0.96),rgba(8,145,178,0.84))] p-6 text-white shadow-[0_35px_120px_rgba(8,145,178,0.22)] md:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/14">
            <BookOpenText className="h-6 w-6" />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">RecallForge</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Transforme seu material em treino ativo.</h1>
          <p className="mt-4 text-sm leading-7 text-cyan-50/88">
            Cole um texto, envie um arquivo e escolha o melhor jeito de revisar.
          </p>
          <div className="mt-8 space-y-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-cyan-50/90">
              Seu progresso fica salvo automaticamente para você continuar depois.
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-cyan-50/90">
              As perguntas nascem dos pontos mais importantes do próprio material.
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Sessões recentes</p>
              <p className="text-xs text-slate-500">Retome seus estudos sem perder o ritmo.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {recentSessions.length > 0 ? (
              recentSessions.map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {getQuizModeLabel(item.mode)} - {item.createdAtLabel}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {formatScore(item.score)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
                Ainda não há nenhuma sessão por aqui. Quando você concluir um estudo, ele aparece neste painel.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-dashed border-cyan-200 bg-cyan-50/70 p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-cyan-700" />
            <p className="text-sm font-semibold text-cyan-900">Feito para focar no estudo</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-cyan-800/90">
            Entre direto no que importa: revisar, responder e entender melhor o que ainda precisa de atenção.
          </p>
        </div>
      </aside>
    </div>
  );
}
