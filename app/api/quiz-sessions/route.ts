import { prisma } from "@/lib/prisma";
import { convertImportCandidatesToQuestionDrafts } from "@/lib/questionnaire-import";
import {
  detectStructuredQuestionnaire,
  generateQuizFromDocument,
  getMinimumQuestionTarget,
  getUnavailableModeMessage,
} from "@/lib/quiz/mock-quiz-generator";
import { buildQuizFromQuestionDrafts, getQuestionTargetForMode } from "@/lib/quiz-session/from-question-drafts";
import { serializeDocument, serializeQuizSession } from "@/lib/serializers";
import type { ImportCandidate, QuestionType } from "@/lib/types";
import { serializeQuestionConfig } from "@/lib/utils";
import { isQuizComposition, isQuizMode, resolveQuizComposition } from "@/lib/validation";

export const runtime = "nodejs";

type StoredQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "FILL_BLANK" | "SHORT_ANSWER" | "FLASHCARD";

function toStoredQuestionType(type: QuestionType): StoredQuestionType {
  if (type === "REVEAL_ANSWER") {
    return "FLASHCARD";
  }

  if (type === "MATCHING" || type === "MULTI_SELECT") {
    return "MULTIPLE_CHOICE";
  }

  return type;
}

function invalidQuestionnaireResponse() {
  return Response.json(
    {
      error:
        "Este material não parece estar em formato de questionário. O RecallForge trabalha com questionários prontos. Envie perguntas e respostas, alternativas com gabarito, verdadeiro/falso, associação ou pares de frente e verso.",
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    importCandidates?: ImportCandidate[];
    mode?: string;
    composition?: string;
  };

  if (!body.documentId || !body.mode || !isQuizMode(body.mode)) {
    return Response.json({ error: "Não foi possível abrir esse modo de estudo." }, { status: 400 });
  }

  if (body.composition && !isQuizComposition(body.composition)) {
    return Response.json({ error: "Não foi possível aplicar essa composição de questões." }, { status: 400 });
  }

  const requestedComposition = body.composition && isQuizComposition(body.composition) ? body.composition : undefined;
  const composition = resolveQuizComposition(body.mode, requestedComposition);

  const existingDocument = await prisma.document.findUnique({
    where: { id: body.documentId },
  });

  if (!existingDocument) {
    return Response.json({ error: "Não encontramos esse material." }, { status: 404 });
  }

  const document = serializeDocument(existingDocument);

  const generated = Array.isArray(body.importCandidates) && body.importCandidates.length > 0
    ? (() => {
        const drafts = convertImportCandidatesToQuestionDrafts(body.importCandidates);
        return buildQuizFromQuestionDrafts(document.title, drafts, body.mode, composition);
      })()
    : (() => {
        if (!detectStructuredQuestionnaire(document.cleanedText)) {
          return null;
        }

        return generateQuizFromDocument(document, body.mode, composition);
      })();

  if (!generated) {
    return invalidQuestionnaireResponse();
  }

  if (generated.questions.length === 0) {
    return Response.json(
      {
        error: getUnavailableModeMessage(body.mode),
      },
      { status: 400 },
    );
  }

  const targetCount = Array.isArray(body.importCandidates) && body.importCandidates.length > 0
    ? getQuestionTargetForMode(body.mode)
    : getMinimumQuestionTarget(body.mode);
  const generationNote =
    generated.questions.length < targetCount
      ? `Este questionário oferece ${generated.questions.length} ${
          generated.questions.length === 1 ? "pergunta útil" : "perguntas úteis"
        } neste modo. Mantivemos apenas o que ficou confiável após a revisão da importação.`
      : undefined;

  const session = await prisma.quizSession.create({
    data: {
      documentId: existingDocument.id,
      mode: body.mode,
      title: generated.title,
      questionCount: generated.questions.length,
      questions: {
        create: generated.questions.map((question, index) => ({
          type: toStoredQuestionType(question.type),
          position: index + 1,
          prompt: question.prompt,
          topic: question.topic,
          choicesJson: serializeQuestionConfig({
            choices: question.choices,
            matchingPairs: question.matchingPairs,
            presentationType:
              question.type === "MATCHING" || question.type === "REVEAL_ANSWER" || question.type === "MULTI_SELECT"
                ? question.type
                : undefined,
            responseFormat: question.responseFormat,
          }),
          correctAnswer: question.correctAnswer ?? null,
          explanation: question.explanation ?? null,
          rubric: question.rubric ?? null,
          referenceAnswer: question.referenceAnswer ?? null,
        })),
      },
    },
    include: {
      questions: true,
    },
  });

  return Response.json({
    session: {
      ...serializeQuizSession(session),
      composition,
    },
    composition,
    generationNote,
  });
}
