import { prisma } from "@/lib/prisma";
import {
  generateQuizFromDocument,
  getMinimumQuestionTarget,
  MINIMUM_STRUCTURED_QUESTION_PAIRS,
  parseStructuredQuestionnaire,
} from "@/lib/quiz/mock-quiz-generator";
import { serializeDocument, serializeQuizSession } from "@/lib/serializers";
import { serializeQuestionConfig } from "@/lib/utils";
import { isQuizComposition, isQuizMode, resolveQuizComposition } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
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

  const existingDocument = await prisma.document.findUnique({
    where: { id: body.documentId },
  });

  if (!existingDocument) {
    return Response.json({ error: "Não encontramos esse material." }, { status: 404 });
  }

  const document = serializeDocument(existingDocument);
  const structuredQuestions = parseStructuredQuestionnaire(document.cleanedText);

  if (structuredQuestions.length === 0) {
    return Response.json(
      {
        error:
          "Este material não parece estar em formato de perguntas e respostas. O RecallForge trabalha com questionários prontos. Reestruture o conteúdo usando P:/R: ou Pergunta:/Resposta: e tente novamente.",
      },
      { status: 400 },
    );
  }

  if (structuredQuestions.length < MINIMUM_STRUCTURED_QUESTION_PAIRS) {
    return Response.json(
      {
        error:
          "Não encontrei perguntas e respostas suficientes neste material. Envie um arquivo estruturado com perguntas e respostas.",
      },
      { status: 400 },
    );
  }

  const composition = resolveQuizComposition(body.mode, requestedComposition);
  const generated = generateQuizFromDocument(document, body.mode, composition);
  if (generated.questions.length === 0) {
    return Response.json(
      {
        error: "Não encontrei perguntas suficientes para esse modo neste questionário. Tente outro modo de estudo.",
      },
      { status: 400 },
    );
  }

  const targetCount = getMinimumQuestionTarget(body.mode);
  const generationNote =
    generated.questions.length < targetCount
      ? `Este questionário oferece ${generated.questions.length} ${generated.questions.length === 1 ? "pergunta útil" : "perguntas úteis"} neste modo. Mantivemos apenas o que tinha pares confiáveis no arquivo.`
      : undefined;

  const session = await prisma.quizSession.create({
    data: {
      documentId: existingDocument.id,
      mode: body.mode,
      title: generated.title,
      questionCount: generated.questions.length,
      questions: {
        create: generated.questions.map((question, index) => ({
          type: question.type,
          position: index + 1,
          prompt: question.prompt,
          topic: question.topic,
          choicesJson: serializeQuestionConfig({
            choices: question.choices,
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
