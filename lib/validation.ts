import path from "node:path";

import type { DocumentSource, QuizComposition, QuizMode } from "@/lib/types";
import { quizCompositions, quizModes } from "@/lib/types";
import { getUnsupportedFileMessage, humanizeDocumentTitle } from "@/lib/utils";

export const MIN_TEXT_LENGTH = 140;
export const SUPPORTED_EXTENSIONS = [".txt", ".pdf", ".docx"] as const;
type UploadedDocumentSource = Exclude<DocumentSource, "MANUAL_TEXT">;

const supportedMimeTypes: Record<UploadedDocumentSource, Set<string>> = {
  TXT: new Set(["text/plain", "application/octet-stream", ""]),
  PDF: new Set([
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "applications/vnd.pdf",
    "text/pdf",
    "application/octet-stream",
    "",
  ]),
  DOCX: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
    "",
  ]),
} as const;

export function inferDocumentSource(fileName: string): UploadedDocumentSource | null {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".txt") {
    return "TXT";
  }

  if (extension === ".pdf") {
    return "PDF";
  }

  if (extension === ".docx") {
    return "DOCX";
  }

  return null;
}

function normalizeMimeType(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export const getFileValidationMessage = getUnsupportedFileMessage;

export function isQuizMode(value: string): value is QuizMode {
  return quizModes.includes(value as QuizMode);
}

export function isQuizComposition(value: string): value is QuizComposition {
  return quizCompositions.includes(value as QuizComposition);
}

export function resolveQuizComposition(mode: QuizMode, composition?: QuizComposition) {
  if (mode === "FEYNMAN") {
    return "DISCURSIVE_ONLY" as const;
  }

  if (mode === "FLASHCARDS") {
    return "AUTO" as const;
  }

  return composition ?? "AUTO";
}

export function validateManualText(text: string) {
  if (!text.trim()) {
    return "Cole um questionário com perguntas e respostas para continuar.";
  }

  return null;
}

export function validateUploadedFile(file: File) {
  if (file.size === 0) {
    return "O arquivo enviado está vazio. Escolha outro material para continuar.";
  }

  const source = inferDocumentSource(file.name);
  if (!source) {
    return getFileValidationMessage(file.name);
  }

  const mimeType = normalizeMimeType(file.type);
  if (mimeType && !supportedMimeTypes[source].has(mimeType)) {
    return `O arquivo parece ser ${mimeType}, mas o nome indica ${path.extname(file.name)}. Confira se você escolheu o material certo.`;
  }

  return null;
}

export function validateUploadedBuffer(
  fileName: string,
  mimeType: string | null,
  buffer: Buffer,
  source: UploadedDocumentSource,
) {
  const extension = path.extname(fileName).toLowerCase();
  const normalizedMime = normalizeMimeType(mimeType);

  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return getFileValidationMessage(fileName);
  }

  if (source === "PDF" && buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
    return "Não conseguimos reconhecer um PDF válido nesse arquivo. Tente outro PDF ou envie o texto em .txt.";
  }

  if (source === "DOCX") {
    const isZip = buffer.subarray(0, 2).toString("hex") === "504b";
    if (!isZip) {
      return "Não conseguimos reconhecer um arquivo .docx válido. Se for um .doc antigo, converta para .docx ou .txt.";
    }
  }

  if (normalizedMime && !supportedMimeTypes[source].has(normalizedMime)) {
    return `O arquivo foi enviado como ${normalizedMime}, mas não parece compatível com ${extension}.`;
  }

  return null;
}

export function buildExtractionFailureMessage(source: DocumentSource) {
  if (source === "PDF") {
    return "Não conseguimos aproveitar texto suficiente desse PDF. Confira se o arquivo tem texto selecionável ou tente a versão em .txt.";
  }

  if (source === "DOCX") {
    return "Não conseguimos aproveitar texto suficiente desse .docx. Confira se o arquivo não está corrompido ou tente exportar novamente.";
  }

  if (source === "TXT") {
    return "Não conseguimos aproveitar texto suficiente desse arquivo .txt.";
  }

  return "Não foi possível aproveitar conteúdo suficiente. Cole um questionário com perguntas e respostas para continuar.";
}

export function deriveDocumentTitle(title: string, fileName: string | null, cleanedText: string) {
  if (title.trim()) {
    return humanizeDocumentTitle(title.trim());
  }

  if (fileName) {
    return humanizeDocumentTitle(path.basename(fileName, path.extname(fileName)));
  }

  const firstLine = cleanedText.split("\n")[0]?.trim();
  return firstLine && firstLine.length <= 80 ? humanizeDocumentTitle(firstLine) : "Material de estudo";
}
