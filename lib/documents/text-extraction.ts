import "server-only";

import { createRequire } from "node:module";

import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text?: string }> = require(
  "pdf-parse/lib/pdf-parse.js",
);

export async function extractTextFromTxt(buffer: Buffer) {
  const utf8 = buffer.toString("utf-8");
  if (!utf8.includes("�")) {
    return utf8;
  }

  return buffer.toString("latin1");
}

export async function extractTextFromPdf(buffer: Buffer) {
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

export async function extractTextFromDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}
