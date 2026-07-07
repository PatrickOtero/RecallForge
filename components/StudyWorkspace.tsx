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
import { studyWorkspaceStyles as styles } from "./StudyWorkspace.styles";

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
      setFlowError(payload.error ?? "Não foi possível abrir essa rodada de estudo.");
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
    <section className={styles.root}>
      <div className={styles.headerCard}>
        <h1 className={styles.title}>RecallForge</h1>
        <p className={styles.subtitle}>
          Transforme um questionário pronto em estudo interativo.
        </p>
      </div>

      <div className={styles.shell}>
        {step === "input" ? (
          <UploadStudyMaterial isPending={isAnalysisPending} onSuccess={handleAnalyzeSuccess} />
        ) : null}

        {step === "modes" && document ? (
          <div className={styles.modeStep}>
            {flowError ? <div className={styles.error}>{flowError}</div> : null}
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
