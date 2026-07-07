import type {
  AnswerAttempt as PrismaAnswerAttempt,
  Document as PrismaDocument,
  Question as PrismaQuestion,
  QuizSession as PrismaQuizSession,
} from "@prisma/client";
import type {
  AnswerAttempt,
  Document,
  Question,
  QuestionForEvaluation,
  QuizSession,
} from "@/lib/types";
import { humanizeDocumentTitle, parseQuestionConfig, safeJsonParse } from "@/lib/utils";

type SessionWithQuestions = PrismaQuizSession & {
  questions: PrismaQuestion[];
};

export type SessionWithQuestionsAndAttempts = SessionWithQuestions & {
  answerAttempts: PrismaAnswerAttempt[];
};

export function serializeDocument(document: PrismaDocument): Document {
  return {
    id: document.id,
    title: humanizeDocumentTitle(document.title),
    sourceType: document.sourceType,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    rawText: document.rawText,
    cleanedText: document.cleanedText,
    chunkCount: document.chunkCount,
    createdAt: document.createdAt.toISOString(),
  };
}

export function serializeQuestion(question: PrismaQuestion): Question {
  const config = parseQuestionConfig(question.choicesJson);
  const questionType = config.presentationType ?? question.type;
  const baseQuestion = {
    id: question.id,
    sessionId: question.sessionId,
    type: questionType,
    position: question.position,
    prompt: question.prompt,
    topic: question.topic,
    choices: config.choices,
    matchingPairs: config.matchingPairs,
    responseFormat: config.responseFormat,
  };

  if (questionType === "SHORT_ANSWER" || questionType === "REVEAL_ANSWER") {
    return {
      ...baseQuestion,
      expectedAnswer: question.correctAnswer ?? undefined,
      rubric: question.rubric ?? undefined,
      referenceAnswer: question.referenceAnswer ?? undefined,
    };
  }

  if (questionType === "FLASHCARD") {
    return {
      ...baseQuestion,
      expectedAnswer: question.correctAnswer ?? undefined,
      referenceAnswer: question.referenceAnswer ?? undefined,
    };
  }

  return baseQuestion;
}

export function serializeQuestionForEvaluation(question: PrismaQuestion): QuestionForEvaluation {
  const config = parseQuestionConfig(question.choicesJson);
  return {
    id: question.id,
    sessionId: question.sessionId,
    type: config.presentationType ?? question.type,
    position: question.position,
    prompt: question.prompt,
    topic: question.topic,
    choices: config.choices,
    matchingPairs: config.matchingPairs,
    responseFormat: config.responseFormat,
    correctAnswer: question.correctAnswer ?? undefined,
    explanation: question.explanation ?? undefined,
    rubric: question.rubric ?? undefined,
    referenceAnswer: question.referenceAnswer ?? undefined,
  };
}

export function serializeAnswerAttempt(attempt: PrismaAnswerAttempt): AnswerAttempt {
  return {
    id: attempt.id,
    sessionId: attempt.sessionId,
    questionId: attempt.questionId,
    responseText: attempt.responseText,
    selfAssessment: attempt.selfAssessment,
    isCorrect: attempt.isCorrect,
    score: attempt.score,
    feedback: attempt.feedback,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

export function serializeQuizSession(session: SessionWithQuestions): QuizSession {
  return {
    id: session.id,
    documentId: session.documentId,
    mode: session.mode,
    title: humanizeDocumentTitle(session.title),
    questionCount: session.questionCount,
    answeredCount: session.answeredCount,
    score: session.score,
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    weakTopics: safeJsonParse(session.weakTopicsJson, []),
    recommendations: safeJsonParse(session.recommendationsJson, []),
    generationNote: undefined,
    completedAt: session.completedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    questions: [...session.questions]
      .sort((left, right) => left.position - right.position)
      .map(serializeQuestion),
  };
}
