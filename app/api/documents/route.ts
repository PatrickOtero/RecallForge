import { extractTextFromDocx, extractTextFromPdf, extractTextFromTxt } from "@/lib/documents/text-extraction";
import { cleanExtractedText, splitTextIntoChunks } from "@/lib/normalization/text-normalizer";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";
import {
  generateQuizOptions,
  MINIMUM_STRUCTURED_QUESTION_PAIRS,
  parseStructuredQuestionnaire,
} from "@/lib/quiz/mock-quiz-generator";
import type { DocumentSource } from "@/lib/types";
import {
  buildExtractionFailureMessage,
  deriveDocumentTitle,
  inferDocumentSource,
  validateManualText,
  validateUploadedBuffer,
  validateUploadedFile,
  MIN_TEXT_LENGTH,
} from "@/lib/validation";

export const runtime = "nodejs";

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
      return Response.json({ error: "Tipo de arquivo nao suportado." }, { status: 400 });
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

    sourceType = "MANUAL_TEXT";
    rawText = manualText;
  }

  const cleanedText = cleanExtractedText(rawText);
  const structuredQuestions = parseStructuredQuestionnaire(cleanedText);

  if (cleanedText.length < MIN_TEXT_LENGTH && structuredQuestions.length === 0) {
    return Response.json(
      {
        error: buildExtractionFailureMessage(sourceType),
      },
      { status: 400 },
    );
  }

  if (structuredQuestions.length === 0) {
    return Response.json(
      {
        error:
          "Este material nao parece estar em formato de perguntas e respostas. O RecallForge agora trabalha apenas com questionarios prontos. Reestruture o conteudo com perguntas e respostas e tente novamente.",
      },
      { status: 400 },
    );
  }

  if (structuredQuestions.length < MINIMUM_STRUCTURED_QUESTION_PAIRS) {
    return Response.json(
      {
        error:
          "Nao encontrei perguntas e respostas suficientes neste material. Envie um arquivo estruturado com perguntas e respostas.",
      },
      { status: 400 },
    );
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

  const document = serializeDocument(savedDocument);

  return Response.json({
    document,
    options: generateQuizOptions(document),
  });
}
