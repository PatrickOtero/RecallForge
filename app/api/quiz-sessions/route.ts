import { prisma } from "@/lib/prisma";
import { generateQuizFromDocument, getMinimumQuestionTarget } from "@/lib/quiz/mock-quiz-generator";
import { serializeQuizSession, serializeDocument } from "@/lib/serializers";
import { serializeChoices } from "@/lib/utils";
import { isQuizMode } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    mode?: string;
  };

  if (!body.documentId || !body.mode || !isQuizMode(body.mode)) {
    return Response.json({ error: "Não foi possível abrir esse modo de estudo." }, { status: 400 });
  }

  const existingDocument = await prisma.document.findUnique({
    where: { id: body.documentId },
  });

  if (!existingDocument) {
    return Response.json({ error: "Não encontramos esse material." }, { status: 404 });
  }

  const generated = generateQuizFromDocument(serializeDocument(existingDocument), body.mode);
  const targetCount = getMinimumQuestionTarget(body.mode);
  const generationNote =
    generated.questions.length < targetCount
      ? `Este material gerou ${generated.questions.length} ${generated.questions.length === 1 ? "pergunta útil" : "perguntas úteis"} neste modo. Preferimos reduzir a quantidade quando o texto não oferece conteúdo confiável suficiente.`
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
