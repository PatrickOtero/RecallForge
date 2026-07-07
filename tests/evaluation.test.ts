import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAnswer } from "@/lib/quiz/evaluation";
import type { QuestionForEvaluation } from "@/lib/types";

test("nao corrige resposta aberta por comparacao semantica", () => {
  const question = {
    id: "q-ruptura",
    sessionId: "session-1",
    type: "REVEAL_ANSWER",
    position: 1,
    prompt: "O que e ruptura?",
    topic: "Ruptura",
    correctAnswer: "Ruptura significa a falta de um produto no momento da compra pelo consumidor.",
    referenceAnswer: "Ruptura significa a falta de um produto no momento da compra pelo consumidor.",
  } satisfies QuestionForEvaluation;

  const result = evaluateAnswer(question, "Falta do item pra venda na area de vendas", "ALMOST");

  assert.equal(result.responseText, null);
  assert.equal(result.selfAssessment, "ALMOST");
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0.6);
  assert.match(result.feedback ?? "", /Autoavaliação registrada/i);
});

test("corrige associacao por pares objetivos", () => {
  const question = {
    id: "q-match",
    sessionId: "session-1",
    type: "MATCHING",
    position: 1,
    prompt: "Associe cada item a descricao correta.",
    topic: "Vinhos",
    matchingPairs: [
      { id: "a", left: "Provence", right: "Roses secos" },
      { id: "b", left: "Roussillon", right: "VDN" },
    ],
  } satisfies QuestionForEvaluation;

  const result = evaluateAnswer(question, JSON.stringify({ a: "Roses secos", b: "VDN" }));

  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  assert.match(result.feedback ?? "", /associações estão corretas/i);
});
