"use client";

import { useDeferredValue, useState } from "react";
import { FileText, Upload } from "lucide-react";

import type { IngestDocumentResponse } from "@/lib/types";
import { cn, getUnsupportedFileMessage } from "@/lib/utils";

interface UploadStudyMaterialProps {
  isPending: boolean;
  onSuccess: (payload: IngestDocumentResponse) => void;
}

export function UploadStudyMaterial({ isPending, onSuccess }: UploadStudyMaterialProps) {
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [title, setTitle] = useState("");
  const [manualText, setManualText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deferredText = useDeferredValue(manualText);
  const wordCount = deferredText.trim() ? deferredText.trim().split(/\s+/).length : 0;
  const pending = isPending || isSubmitting;

  function handleFileChange(nextFile: File | null) {
    setFile(null);
    setError(null);

    if (!nextFile) {
      return;
    }

    const fileName = nextFile.name.toLowerCase();
    if (!/\.(txt|pdf|docx)$/i.test(fileName)) {
      setError(getUnsupportedFileMessage(nextFile.name));
      return;
    }

    setFile(nextFile);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("title", title);

    if (inputMode === "text") {
      formData.append("manualText", manualText);
    } else if (file) {
      formData.append("file", file);
    }

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as IngestDocumentResponse & { error?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "Nao foi possivel analisar o material.");
      return;
    }

    onSuccess(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Material de estudo</h2>
        <p className="text-sm text-slate-600">Cole o texto ou envie um arquivo para montar o questionario.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setInputMode("text")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            inputMode === "text"
              ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20"
              : "bg-white/70 text-slate-600 hover:bg-white",
          )}
        >
          Colar texto
        </button>
        <button
          type="button"
          onClick={() => setInputMode("file")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            inputMode === "file"
              ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20"
              : "bg-white/70 text-slate-600 hover:bg-white",
          )}
        >
          Enviar arquivo
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Nome do material (opcional)</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Capitulo 3 - Fotossintese"
            className="w-full rounded-3xl border border-white/70 bg-white/80 px-5 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
          />
        </label>

        <div className="rounded-3xl border border-white/70 bg-white/65 px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Formatos aceitos</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Texto colado ou upload de <span className="font-semibold text-slate-700">.txt</span>,{" "}
            <span className="font-semibold text-slate-700">.pdf</span> e{" "}
            <span className="font-semibold text-slate-700">.docx</span>.
          </p>
        </div>
      </div>

      {inputMode === "text" ? (
        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-2 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Cole o material</p>
                <p className="text-xs text-slate-500">Use resumo, questionario, apostila ou anotacoes.</p>
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {wordCount} palavras
            </div>
          </div>

          <textarea
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Cole aqui suas perguntas e respostas, anotacoes, apostila ou texto-base."
            className="mt-4 min-h-72 w-full resize-none rounded-[1.5rem] border border-slate-100 bg-white px-5 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
          />
        </div>
      ) : (
        <label className="block cursor-pointer rounded-[2rem] border border-dashed border-cyan-200 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] transition hover:border-cyan-400 hover:bg-white">
          <input
            type="file"
            accept=".txt,text/plain,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-slate-900 text-white shadow-lg shadow-slate-900/20">
              <Upload className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-800">{file ? file.name : "Escolha um arquivo"}</p>
              <p className="text-sm text-slate-500">O arquivo sera lido para montar as opcoes de estudo.</p>
            </div>
            <div className="rounded-full bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-700">
              Formatos suportados: TXT, PDF e DOCX
            </div>
          </div>
        </label>
      )}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-500">O material sera analisado antes da geracao das perguntas.</div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Preparando material..." : "Continuar"}
        </button>
      </div>
    </form>
  );
}
