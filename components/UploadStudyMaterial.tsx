"use client";

import { useDeferredValue, useState } from "react";
import { FileText, Upload } from "lucide-react";

import type { IngestDocumentResponse } from "@/lib/types";
import { getUnsupportedFileMessage } from "@/lib/utils";
import { uploadStudyMaterialStyles as styles } from "./UploadStudyMaterial.styles";

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
      setError(payload.error ?? "Não foi possível validar esse questionário.");
      return;
    }

    onSuccess(payload);
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Envie um questionário pronto</h2>
        <p className={styles.description}>Cole perguntas e respostas ou envie um arquivo variado. Vamos detectar o formato e mostrar uma prévia antes de estudar.</p>
      </div>

      <div className={styles.modeButtons}>
        <button
          type="button"
          onClick={() => setInputMode("text")}
          className={styles.modeButton({ active: inputMode === "text" })}
        >
          Colar questionário
        </button>
        <button
          type="button"
          onClick={() => setInputMode("file")}
          className={styles.modeButton({ active: inputMode === "file" })}
        >
          Enviar arquivo
        </button>
      </div>

      <div className={styles.metadataGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nome do material (opcional)</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Revisão de microbiologia"
            className={styles.titleInput}
          />
        </label>

        <div className={styles.formatsCard}>
          <p className={styles.formatsTitle}>Formatos aceitos</p>
          <p className={styles.formatsText}>
            Texto colado ou upload de <span className={styles.formatName}>.txt</span>,{" "}
            <span className={styles.formatName}>.pdf</span> e{" "}
            <span className={styles.formatName}>.docx</span>, inclusive quando o questionário veio de páginas, listas, tabelas ou bancos de questões.
          </p>
        </div>
      </div>

      {inputMode === "text" ? (
        <div className={styles.textPanel}>
          <div className={styles.textPanelHeader}>
            <div className={styles.textPanelIntro}>
              <div className={styles.textIconWrapper}>
                <FileText className={styles.textIcon} />
              </div>
              <div>
                <p className={styles.textPanelTitle}>Cole o questionário</p>
                <p className={styles.textPanelHint}>Ex.: `1. Pergunta?` + `Resposta:` + texto da resposta.</p>
              </div>
            </div>
            <div className={styles.wordCountBadge}>
              {wordCount} palavras
            </div>
          </div>

          <textarea
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder={"1. O que é fotossíntese?\nResposta:\nProcesso em que...\n\n2. Quais são as etapas?\nResposta:\n..."}
            className={styles.manualTextarea}
          />
        </div>
      ) : (
        <label className={styles.fileDrop}>
          <input
            type="file"
            accept=".txt,text/plain,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className={styles.hiddenInput}
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />
          <div className={styles.fileDropContent}>
            <div className={styles.uploadIconWrapper}>
              <Upload className={styles.uploadIcon} />
            </div>
            <div className={styles.fileDetails}>
              <p className={styles.fileName}>{file ? file.name : "Escolha um arquivo"}</p>
              <p className={styles.fileHint}>Use um arquivo que já contenha perguntas e respostas.</p>
            </div>
            <div className={styles.supportedBadge}>
              Formatos suportados: TXT, PDF e DOCX
            </div>
          </div>
        </label>
      )}

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.footer}>
        <div className={styles.footerNote}>
          Vamos montar uma prévia editável do que foi entendido antes de liberar os modos de estudo.
        </div>
        <button type="submit" disabled={pending} className={styles.submitButton}>
          {pending ? "Validando questionário..." : "Continuar"}
        </button>
      </div>
    </form>
  );
}
