import test from "node:test";
import assert from "node:assert/strict";

import { cleanExtractedText } from "@/lib/normalization/text-normalizer";
import { generateQuizFromDocument } from "@/lib/quiz/mock-quiz-generator";
import { normalizeForComparison } from "@/lib/utils";
import type { Document, QuestionDraft } from "@/lib/types";

function buildDocument(cleanedText: string): Document {
  return {
    id: "doc-test",
    title: "Gestão dos Estoques",
    sourceType: "MANUAL_TEXT",
    originalFileName: null,
    mimeType: null,
    rawText: cleanedText,
    cleanedText,
    chunkCount: 1,
    createdAt: new Date("2026-06-25T00:00:00.000Z").toISOString(),
  };
}

function findQuestion(questions: QuestionDraft[], fragment: string) {
  const normalizedFragment = normalizeForComparison(fragment);
  return questions.find((question) => normalizeForComparison(question.prompt).includes(normalizedFragment));
}

test("gera menos cards, mas só a partir de trechos completos e sem mojibake", () => {
  const cleanedText = cleanExtractedText(`
Gestão dos Estoques

Acesso: RMS >> Exportar RMS
Campo de alteração
ZSBI

Inventário é a contagem das mercadorias físicas encontradas no salão de vendas e depósitos, confrontada com a posição do estoque lógico.

Relatório de Produtos Não Atendidos - Serve para verificar os itens para os quais o sistema gerou sugestão de pedido para a loja, porém por algum motivo o CD não enviou os produtos.

Alteração de Pedidos Pães Industrializados - A ferramenta visa disponibilizar para as lojas a possibilidade de efetuar alterações nas sugestões dos pedidos de pães industrializados que serão gerados pelo Setor de Abastecimento.
Essa ferramenta permite que as lojas alterem as sugestões dos pedidos de pães industrializados gerados pelo Setor de Abastecimento.
A ferramenta de alteração de pedidos de pães industrializados permite que as lojas alterem as sugestões geradas pelo Setor de Abastecimento.

Cobertura de estoque é o índice utilizado para medir por quantos dias o estoque atual consegue atender a saída média.

da loja. Nas opções, escolhemos Custo Última Entrada com ICMS.
`);

  const generated = generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS");
  const prompts = generated.questions.map((question) => question.prompt);
  const signatures = prompts.map((prompt) => normalizeForComparison(prompt));

  assert.ok(generated.questions.length > 0);
  assert.equal(new Set(signatures).size, signatures.length);

  for (const question of generated.questions) {
    assert.doesNotMatch(question.prompt, /Ãƒ|Ã‚|ï¿½/);
    assert.doesNotMatch(question.referenceAnswer ?? "", /Ãƒ|Ã‚|ï¿½/);
    assert.doesNotMatch(question.correctAnswer ?? "", /Ãƒ|Ã‚|ï¿½/);
  }

  assert.ok(!prompts.some((prompt) => /icms/i.test(prompt)));
  assert.ok(!prompts.some((prompt) => /zsbi/i.test(prompt)));
  assert.ok(!prompts.some((prompt) => /acesso:|>>|exportar rms|campo de altera/i.test(prompt)));

  const inventoryQuestion = findQuestion(generated.questions, "inventário");
  assert.ok(inventoryQuestion);
  assert.match(inventoryQuestion!.prompt, /inventário/i);

  const reportQuestion = findQuestion(generated.questions, "produtos não atendidos");
  assert.ok(reportQuestion);
  assert.match(reportQuestion!.prompt, /para que serve/i);
  assert.match(reportQuestion!.correctAnswer ?? "", /serve para verificar os itens/i);
  assert.match(reportQuestion!.correctAnswer ?? "", /não enviou os produtos/i);
  assert.match(reportQuestion!.referenceAnswer ?? "", /sugestão de pedido/i);

});
