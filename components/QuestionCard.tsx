import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";

import type { AnswerAttempt, Question } from "@/lib/types";
import { cn, getQuestionTypeLabel } from "@/lib/utils";

interface QuestionCardProps {
  attempt?: AnswerAttempt;
  children: ReactNode;
  question: Question;
  showImmediateFeedback: boolean;
}

export function QuestionCard({ attempt, children, question, showImmediateFeedback }: QuestionCardProps) {
  const answered = Boolean(attempt);
  const isPositive = (attempt?.score ?? 0) >= 0.7;

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {getQuestionTypeLabel(question.type)}
        </span>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">{question.topic}</span>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Pergunta {question.position}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{question.prompt}</h3>
      </div>

      <div className="mt-8">{children}</div>

      {answered ? (
        <div
          className={cn(
            "mt-8 rounded-[1.75rem] border px-5 py-4",
            showImmediateFeedback
              ? isPositive
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50",
          )}
        >
          <div className="flex items-start gap-3">
            {showImmediateFeedback ? (
              isPositive ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              ) : (
                <CircleAlert className="mt-0.5 h-5 w-5 text-amber-600" />
              )
            ) : (
              <Clock3 className="mt-0.5 h-5 w-5 text-slate-500" />
            )}

            <div className="space-y-2 text-sm leading-6">
              <p className="font-semibold text-slate-800">
                {showImmediateFeedback
                  ? isPositive
                    ? "Boa resposta"
                    : "Vale revisar este ponto"
                  : "Resposta guardada"}
              </p>
              <p className="text-slate-600">
                {showImmediateFeedback
                  ? attempt?.feedback ?? "Resposta recebida."
                  : "Sua resposta fica guardada e o resultado aparece no final da rodada."}
              </p>
              {showImmediateFeedback && question.referenceAnswer ? (
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-700">Trecho de referência:</span>{" "}
                  {question.referenceAnswer}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
