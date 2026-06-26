import { createRequire } from "node:module";

import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text?: string }> = require(
  "pdf-parse/lib/pdf-parse.js",
);

function tryDecodeUtf8(buffer: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

export async function extractTextFromTxt(buffer: Buffer) {
  const utf8 = tryDecodeUtf8(buffer);
  if (utf8 !== null) {
    return utf8.normalize("NFC");
  }

  return buffer.toString("latin1").normalize("NFC");
}

export async function extractTextFromPdf(buffer: Buffer) {
  const result = await pdfParse(buffer);
  return (result.text ?? "").normalize("NFC");
}

export async function extractTextFromDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").normalize("NFC");
}
