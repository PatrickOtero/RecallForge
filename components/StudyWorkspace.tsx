"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { QuizModeSelector } from "@/components/QuizModeSelector";
import { QuizResultSummary } from "@/components/QuizResultSummary";
import { QuizRunner } from "@/components/QuizRunner";
import { UploadStudyMaterial } from "@/components/UploadStudyMaterial";
import type {
  CreateQuizSessionResponse,
  Document,
  IngestDocumentResponse,
  QuizComposition,
  QuizModeOption,
  QuizResultSummary as QuizSummary,
  QuizSession,
} from "@/lib/types";

export function StudyWorkspace() {
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

  async function handleModeSelect(mode: QuizModeOption["mode"], composition?: QuizComposition) {
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
        composition,
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
        composition: payload.composition,
        generationNote: payload.generationNote,
      });
      setStep("quiz");
    });
  }

  function handleRetrySameMode() {
    if (!session) {
      return;
    }

    void handleModeSelect(session.mode, session.composition);
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
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/70 px-6 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">RecallForge</h1>
        <p className="mt-2 text-sm text-slate-600">
          Transforme um questionario pronto em estudo interativo, sem tentar inventar perguntas novas.
        </p>
      </div>

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
            onExit={resetFlow}
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
  );
}
