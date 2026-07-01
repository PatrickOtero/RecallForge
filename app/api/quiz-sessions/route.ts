import { prisma } from "@/lib/prisma";
import {
  generateQuizFromDocument,
  getMinimumQuestionTarget,
  MINIMUM_STRUCTURED_QUESTION_PAIRS,
  parseStructuredQuestionnaire,
} from "@/lib/quiz/mock-quiz-generator";
import { serializeDocument, serializeQuizSession } from "@/lib/serializers";
import { serializeChoices } from "@/lib/utils";
import { isQuizMode } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    mode?: string;
  };

  if (!body.documentId || !body.mode || !isQuizMode(body.mode)) {
    return Response.json({ error: "Nao foi possivel abrir esse modo de estudo." }, { status: 400 });
  }

  const existingDocument = await prisma.document.findUnique({
    where: { id: body.documentId },
  });

  if (!existingDocument) {
    return Response.json({ error: "Nao encontramos esse material." }, { status: 404 });
  }

  const document = serializeDocument(existingDocument);
  const structuredQuestions = parseStructuredQuestionnaire(document.cleanedText);

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

  const generated = generateQuizFromDocument(document, body.mode);
  if (generated.questions.length === 0) {
    return Response.json(
      {
        error: "Nao encontrei perguntas suficientes para esse modo neste questionario. Tente outro modo de estudo.",
      },
      { status: 400 },
    );
  }

  const targetCount = getMinimumQuestionTarget(body.mode);
  const generationNote =
    generated.questions.length < targetCount
      ? `Este questionario oferece ${generated.questions.length} ${generated.questions.length === 1 ? "pergunta util" : "perguntas uteis"} neste modo. Mantivemos apenas o que tinha pares confiaveis no arquivo.`
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
          choicesJson: serializeChoices(question.choices),
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
    session: serializeQuizSession(session),
    generationNote,
  });
}
