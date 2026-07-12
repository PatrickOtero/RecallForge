import { extractTextFromDocx, extractTextFromPdf, extractTextFromTxt } from "@/lib/documents/text-extraction";
import { splitTextIntoChunks } from "@/lib/normalization/text-normalizer";
import { prisma } from "@/lib/prisma";
import { buildImportReport, normalizeQuestionnaireInput } from "@/lib/questionnaire-import";
import { serializeDocument } from "@/lib/serializers";
import type { DocumentSource } from "@/lib/types";
import {
  buildExtractionFailureMessage,
  deriveDocumentTitle,
  inferDocumentSource,
  MIN_TEXT_LENGTH,
  validateManualText,
  validateUploadedBuffer,
  validateUploadedFile,
} from "@/lib/validation";

export const runtime = "nodejs";

function invalidQuestionnaireResponse() {
  return Response.json(
    {
      error:
        "Não encontramos perguntas suficientes para montar uma prévia confiável. Revise o material ou tente outro arquivo.",
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const title = String(formData.get("title") ?? "");
  const manualText = String(formData.get("manualText") ?? "");
  const fileEntry = formData.get("file");

  let rawText = "";
  let sourceType: DocumentSource = "MANUAL_TEXT";
  let originalFileName: string | null = null;
  let mimeType: string | null = null;

  if (fileEntry instanceof File) {
    const fileError = validateUploadedFile(fileEntry);
    if (fileError) {
      return Response.json({ error: fileError }, { status: 400 });
    }

    const source = inferDocumentSource(fileEntry.name);
    if (!source) {
      return Response.json({ error: "Tipo de arquivo não suportado." }, { status: 400 });
    }

    sourceType = source;
    originalFileName = fileEntry.name;
    mimeType = fileEntry.type || null;

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const bufferError = validateUploadedBuffer(fileEntry.name, fileEntry.type || null, buffer, source);
    if (bufferError) {
      return Response.json({ error: bufferError }, { status: 400 });
    }

    try {
      rawText =
        source === "TXT"
          ? await extractTextFromTxt(buffer)
          : source === "PDF"
            ? await extractTextFromPdf(buffer)
            : await extractTextFromDocx(buffer);
    } catch {
      return Response.json({ error: buildExtractionFailureMessage(source) }, { status: 400 });
    }
  } else {
    const textError = validateManualText(manualText);
    if (textError) {
      return Response.json({ error: textError }, { status: 400 });
    }

    rawText = manualText;
  }

  const cleanedText = normalizeQuestionnaireInput(rawText);
  const report = buildImportReport(rawText);

  if (cleanedText.length < MIN_TEXT_LENGTH && report.totalCandidates === 0) {
    return Response.json(
      {
        error: buildExtractionFailureMessage(sourceType),
      },
      { status: 400 },
    );
  }

  if (report.totalCandidates === 0) {
    return invalidQuestionnaireResponse();
  }

  const chunks = splitTextIntoChunks(cleanedText);

  const savedDocument = await prisma.document.create({
    data: {
      title: deriveDocumentTitle(title, originalFileName, cleanedText),
      sourceType,
      originalFileName,
      mimeType,
      rawText,
      cleanedText,
      chunkCount: chunks.length,
    },
  });

  return Response.json({
    document: serializeDocument(savedDocument),
    report,
  });
}
