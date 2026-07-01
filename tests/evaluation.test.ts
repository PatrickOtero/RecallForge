import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAnswer } from "@/lib/quiz/evaluation";
import type { QuestionForEvaluation } from "@/lib/types";

test("aceita resposta curta quando a ideia central e recuperada com sinonimos", () => {
  const result = evaluateAnswer(
    {
      id: "q-ruptura",
      sessionId: "session-1",
      type: "SHORT_ANSWER",
      position: 1,
      prompt: "O que e Ruptura?",
      topic: "Ruptura",
      correctAnswer: "Ruptura significa a falta de um produto no momento da compra pelo consumidor.",
      referenceAnswer: "Ruptura significa a falta de um produto no momento da compra pelo consumidor.",
      rubric: "Mencione falta, produto e cliente.",
      explanation: "A resposta ideal recupera a ideia central com suas palavras.",
    } satisfies QuestionForEvaluation,
    "Falta do item pra venda na area de vendas",
  );

  assert.equal(result.isCorrect, true);
  assert.ok((result.score ?? 0) >= 0.7);
  assert.match(result.feedback ?? "", /boa resposta/i);
});
