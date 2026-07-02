import { prisma } from "@/lib/prisma";
import { summarizeQuizResults } from "@/lib/quiz/evaluation";
import {
  SessionWithQuestionsAndAttempts,
  serializeAnswerAttempt,
  serializeQuestionForEvaluation,
} from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const session = (await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: {
      questions: true,
      answerAttempts: true,
    },
  })) as SessionWithQuestionsAndAttempts | null;

  if (!session) {
    return Response.json({ error: "Não encontramos essa sessão de estudo." }, { status: 404 });
  }

  const questions = session.questions.map(serializeQuestionForEvaluation);
  const attempts = session.answerAttempts.map(serializeAnswerAttempt);
  const summary = summarizeQuizResults(questions, attempts);

  await prisma.quizSession.update({
    where: { id: sessionId },
    data: {
      answeredCount: attempts.length,
      score: summary.score,
      correctCount: summary.correctCount,
      wrongCount: summary.wrongCount,
      weakTopicsJson: JSON.stringify(summary.weakTopics),
      recommendationsJson: JSON.stringify(summary.recommendations),
      completedAt: new Date(),
    },
  });

  return Response.json({ summary });
}
