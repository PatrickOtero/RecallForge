import { prisma } from "@/lib/prisma";
import { convertImportCandidatesToQuestionDrafts, prepareImportSelection } from "@/lib/questionnaire-import";
import type { ConfirmImportResponse, ImportCandidate } from "@/lib/types";
import { buildQuizModeOptionsFromQuestionDrafts } from "@/lib/quiz-session/from-question-drafts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    candidates?: ImportCandidate[];
    documentId?: string;
  };

  if (!body.documentId || !Array.isArray(body.candidates)) {
    return Response.json({ error: "Não foi possível preparar a importação." }, { status: 400 });
  }

  const existingDocument = await prisma.document.findUnique({
    where: { id: body.documentId },
    select: { id: true },
  });

  if (!existingDocument) {
    return Response.json({ error: "Não encontramos esse material." }, { status: 404 });
  }

  const prepared = prepareImportSelection(body.candidates);
  const questions = convertImportCandidatesToQuestionDrafts(prepared.importableCandidates);

  if (questions.length === 0) {
    return Response.json(
      {
        error: "Nenhuma questão válida pôde ser importada.",
        issues: prepared.issues.length > 0 ? prepared.issues : undefined,
      },
      { status: 400 },
    );
  }

  const payload: ConfirmImportResponse = {
    options: buildQuizModeOptionsFromQuestionDrafts(questions),
    validQuestions: questions.length,
    candidates: prepared.importableCandidates,
  };

  return Response.json(payload);
}
