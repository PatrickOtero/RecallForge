import { prisma } from "@/lib/prisma";
import { evaluateAnswer } from "@/lib/quiz/evaluation";
import { serializeAnswerAttempt, serializeQuestionForEvaluation } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = (await request.json()) as {
    questionId?: string;
    responseText?: string;
    selfAssessment?: "MISS" | "ALMOST" | "GOT_IT";
  };

  if (!body.questionId) {
    return Response.json({ error: "Não foi possível identificar a pergunta." }, { status: 400 });
  }

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return Response.json({ error: "Não encontramos essa sessão de estudo." }, { status: 404 });
  }

  const questionRecord = await prisma.question.findFirst({
    where: {
      id: body.questionId,
      sessionId,
    },
  });

  if (!questionRecord) {
    return Response.json({ error: "Essa pergunta não está mais disponível." }, { status: 404 });
  }

  const question = serializeQuestionForEvaluation(questionRecord);

  if (
    (question.type === "FLASHCARD" || question.type === "REVEAL_ANSWER" || question.type === "SHORT_ANSWER") &&
    !body.selfAssessment
  ) {
    return Response.json({ error: "Escolha Errei, Quase ou Acertei para seguir." }, { status: 400 });
  }

  if (
    question.type !== "FLASHCARD" &&
    question.type !== "REVEAL_ANSWER" &&
    question.type !== "SHORT_ANSWER" &&
    !body.responseText?.trim()
  ) {
    return Response.json({ error: "Preencha sua resposta antes de continuar." }, { status: 400 });
  }

  const evaluation = evaluateAnswer(question, body.responseText, body.selfAssessment);

  const attempt = await prisma.answerAttempt.upsert({
    where: {
      sessionId_questionId: {
        sessionId,
        questionId: question.id,
      },
    },
    update: {
      responseText: evaluation.responseText,
      selfAssessment: evaluation.selfAssessment,
      isCorrect: evaluation.isCorrect,
      score: evaluation.score,
      feedback: evaluation.feedback,
    },
    create: {
      sessionId,
      questionId: question.id,
      responseText: evaluation.responseText,
      selfAssessment: evaluation.selfAssessment,
      isCorrect: evaluation.isCorrect,
      score: evaluation.score,
      feedback: evaluation.feedback,
    },
  });

  const answeredCount = await prisma.answerAttempt.count({
    where: { sessionId },
  });

  await prisma.quizSession.update({
    where: { id: sessionId },
    data: {
      answeredCount,
    },
  });

  return Response.json({
    attempt: serializeAnswerAttempt(attempt),
    showImmediateFeedback: true,
  });
}
