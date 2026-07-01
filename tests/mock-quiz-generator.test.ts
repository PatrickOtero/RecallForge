import test from "node:test";
import assert from "node:assert/strict";

import { cleanExtractedText } from "@/lib/normalization/text-normalizer";
import {
  detectStructuredQuestionnaire,
  generateQuizFromDocument,
  parseStructuredQuestionnaire,
} from "@/lib/quiz/mock-quiz-generator";
import { normalizeForComparison } from "@/lib/utils";
import type { Document, QuestionDraft } from "@/lib/types";

function buildDocument(cleanedText: string): Document {
  return {
    id: "doc-test",
    title: "Gestao dos Estoques",
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

function withMockedRandom<T>(values: number[], callback: () => T) {
  const originalRandom = Math.random;
  let index = 0;

  Math.random = () => {
    const value = values[index] ?? values[values.length - 1] ?? 0.5;
    index += 1;
    return value;
  };

  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

test("gera perguntas a partir de unidades completas e bloqueia fragmentos ruins", () => {
  const cleanedText = cleanExtractedText(`
Gestao dos Estoques

Acesso: RMS >> Exportar RMS
Campo de alteracao
ZSBI

Oferta âˆƒ Todos os produtos da carga seca

Inventario e a contagem das mercadorias fisicas encontradas no salao de vendas e depositos, confrontada com a posicao do estoque logico.

Ruptura significa a falta de um produto no momento da compra pelo consumidor.

Relatorio de Produtos Nao Atendidos - Serve para verificar os itens para os quais o sistema gerou sugestao de pedido para a loja, porem por algum motivo o CD nao enviou os produtos.

Cobertura de estoque e o indice utilizado para medir por quantos dias o estoque atual consegue atender a saida media.

da loja. Nas opcoes, escolhemos Custo Ultima Entrada com ICMS.
`);

  const deepDive = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE");
  const quickReview = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW");
  const flashcards = generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS");

  assert.ok(deepDive.questions.length > 0);

  for (const question of [...deepDive.questions, ...quickReview.questions, ...flashcards.questions]) {
    assert.doesNotMatch(question.prompt, /Ãƒ|âˆƒ|â‰¡|ï¿¾/);
    assert.doesNotMatch(question.referenceAnswer ?? "", /Ãƒ|âˆƒ|â‰¡|ï¿¾/);
    assert.doesNotMatch(question.correctAnswer ?? "", /Ãƒ|âˆƒ|â‰¡|ï¿¾/);
    assert.ok(!/acesso:|>>|exportar rms|campo de alteracao|zsbi/i.test(question.prompt));
    assert.ok(!/oferta|carga seca/i.test(question.prompt));
  }

  const ruptureQuestion = findQuestion(deepDive.questions, "ruptura");
  assert.ok(ruptureQuestion);
  assert.equal(ruptureQuestion?.prompt, "O que e Ruptura?");
  assert.match(ruptureQuestion?.correctAnswer ?? "", /falta de um produto/i);
  assert.match(ruptureQuestion?.referenceAnswer ?? "", /momento da compra pelo consumidor/i);

  const quickPrompt = quickReview.questions[0]?.prompt ?? "";
  const deepPrompt = deepDive.questions[0]?.prompt ?? "";
  assert.notEqual(normalizeForComparison(quickPrompt), normalizeForComparison(deepPrompt));

  const firstFlashcard = flashcards.questions[0];
  assert.ok(firstFlashcard);
  assert.doesNotMatch(firstFlashcard.prompt, /\?$/);
  assert.ok((firstFlashcard.correctAnswer ?? "").length > firstFlashcard.prompt.length);

  const multipleChoice = deepDive.questions.find((question) => question.type === "MULTIPLE_CHOICE");
  if (multipleChoice?.choices) {
    const signatures = multipleChoice.choices.map((choice) => normalizeForComparison(choice.label));
    assert.equal(new Set(signatures).size, signatures.length);
  }
});

test("importa questionarios estruturados sem transformar perguntas em topicos artificiais", () => {
  const cleanedText = cleanExtractedText(`
  Use da seguinte forma:
  1. Tente responder sem olhar a resposta.
  2. Confira o gabarito logo abaixo.
  3. Refaça as perguntas erradas no dia seguinte.

  ======================================================================
  BLOCO 1 - FICHA DE DEGUSTACAO
  ======================================================================

  1. Quais sao as cinco partes principais da ficha de degustacao e quantos pontos vale cada uma?
  Resposta:
  Exame visual - 5 pontos.
  Exame olfativo - 5 pontos.
  Exame gustativo - 5 pontos.
  Observacoes, sensacoes finais e evolucao - 3 pontos.
  Harmonizacao - 2 pontos.

  2. O que deve ser registrado na parte de observacoes finais?
  Resposta:
  Sensacoes persistentes, equilibrio do vinho e sua evolucao na taça.

  3. Como a harmonizacao deve ser avaliada na ficha?
  Resposta:
  Pela coerencia entre prato e vinho, considerando intensidade, textura e persistencia.

  BLOCO 2 - EXAME VISUAL

  4. Qual regiao da taça deve ser observada primeiro no exame visual?
  Resposta:
  O centro e depois a borda, para perceber intensidade e evolucao da cor.

  5. O que a limpidez indica no exame visual?
  Resposta:
  Se o vinho esta brilhante, limpo e sem particulas em suspensao.

  BLOCO 3 - BORDEAUX

  6. Quais castas tintas sao mais tradicionais em Bordeaux?
  Resposta:
  Cabernet Sauvignon, Merlot, Cabernet Franc, Petit Verdot e Malbec.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const parsed = parseStructuredQuestionnaire(cleanedText);
  assert.ok(parsed.length >= 5);

  const firstParsed = parsed[0];
  assert.equal(
    firstParsed?.prompt,
    "Quais sao as cinco partes principais da ficha de degustacao e quantos pontos vale cada uma?",
  );
  assert.equal(normalizeForComparison(firstParsed?.topic ?? ""), "ficha de degustacao");
  assert.match(firstParsed?.expectedAnswer ?? "", /exame visual - 5 pontos/i);
  assert.match(firstParsed?.expectedAnswer ?? "", /harmonizacao - 2 pontos/i);

  const deepDive = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE");
  const quickReview = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW");
  const flashcards = generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS");
  const exam = generateQuizFromDocument(buildDocument(cleanedText), "EXAM");

  const importedQuestion = findQuestion(deepDive.questions, "cinco partes principais da ficha de degustacao");
  assert.ok(importedQuestion);
  assert.equal(
    importedQuestion?.prompt,
    "Quais sao as cinco partes principais da ficha de degustacao e quantos pontos vale cada uma?",
  );
  assert.equal(normalizeForComparison(importedQuestion?.topic ?? ""), "ficha de degustacao");
  assert.match(importedQuestion?.correctAnswer ?? "", /exame olfativo - 5 pontos/i);
  assert.match(importedQuestion?.correctAnswer ?? "", /observacoes, sensacoes finais e evolucao - 3 pontos/i);

  for (const question of [...deepDive.questions, ...quickReview.questions, ...flashcards.questions, ...exam.questions]) {
    assert.ok(!/resuma em uma frase o conceito de/i.test(question.prompt));
    assert.ok(!/use da seguinte forma/i.test(question.prompt));
    assert.ok(!/tente responder sem olhar/i.test(question.prompt));
  }

  const flashcard = findQuestion(flashcards.questions, "cinco partes principais da ficha de degustacao");
  assert.ok(flashcard);
  assert.equal(
    flashcard?.prompt,
    "Quais sao as cinco partes principais da ficha de degustacao e quantos pontos vale cada uma?",
  );

  const examQuestion = findQuestion(exam.questions, "quais castas tintas sao mais tradicionais em bordeaux");
  assert.ok(examQuestion);
  if (examQuestion?.type === "MULTIPLE_CHOICE" && examQuestion.choices) {
    const normalizedChoices = examQuestion.choices.map((choice) => normalizeForComparison(choice.label));
    assert.equal(new Set(normalizedChoices).size, normalizedChoices.length);
  }
});

test("trata blocos de associacao sem incorporar a instrucao no prompt individual", () => {
  const cleanedText = cleanExtractedText(`
  BLOCO 14 - QUESTOES DE ASSOCIACAO

  Associe cada item a resposta correta.

  201. Provence
  Resposta:
  Lider francesa e mundial em roses secos e frutados.

  202. Roussillon
  Resposta:
  Regiao responsavel por 78% da producao francesa de VDN.

  203. Picpoul de Pinet
  Resposta:
  AOP do Languedoc dedicada a vinho branco de Piquepoul Blanc.

  204. Sancerre
  Resposta:
  Regiao do Loire Central associada a Sauvignon Blanc.

  205. Tavel
  Resposta:
  Appellation do sul do Rhone reconhecida por roses secos de maior estrutura.
  `);

  const parsed = parseStructuredQuestionnaire(cleanedText);
  assert.equal(parsed.length, 5);
  assert.equal(parsed[0]?.prompt, "Provence");
  assert.equal(parsed[0]?.promptStyle, "ASSOCIATION");
  assert.equal(parsed[0]?.associationItem, "Provence");
  assert.equal(normalizeForComparison(parsed[0]?.topic ?? ""), "questoes de associacao");
  assert.match(parsed[0]?.referenceExcerpt ?? "", /^Provence - Lider francesa/i);

  const deepDive = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE");
  const flashcards = generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS");
  const exam = generateQuizFromDocument(buildDocument(cleanedText), "EXAM");

  const shortAnswer = findQuestion(deepDive.questions, "provence esta associada a que");
  assert.ok(shortAnswer);
  assert.equal(shortAnswer?.prompt, "Provence esta associada a que?");
  assert.match(shortAnswer?.correctAnswer ?? "", /lider francesa e mundial em roses secos/i);

  const flashcard = flashcards.questions.find((question) => normalizeForComparison(question.prompt) === "provence");
  assert.ok(flashcard);
  assert.match(flashcard?.correctAnswer ?? "", /roses secos e frutados/i);

  const multipleChoice = findQuestion(exam.questions, "provence esta associada a qual descricao");
  assert.ok(multipleChoice);
  assert.equal(multipleChoice?.type, "MULTIPLE_CHOICE");
  assert.ok(
    multipleChoice?.choices?.every(
      (choice) => !/associe cada item|resposta correta|201\. provence/i.test(choice.label),
    ),
  );
  if (multipleChoice?.choices) {
    const normalizedChoices = multipleChoice.choices.map((choice) => normalizeForComparison(choice.label));
    assert.equal(new Set(normalizedChoices).size, normalizedChoices.length);
    assert.ok(normalizedChoices.some((choice) => choice.includes("lider francesa e mundial em roses secos e frutados")));
    assert.ok(normalizedChoices.some((choice) => choice.includes("78 da producao francesa de vdn")));
  }
});

test("sorteia perguntas estruturadas de forma balanceada em vez de pegar sempre o inicio", () => {
  const cleanedText = cleanExtractedText(`
  BLOCO 1 - BASE
  1. O que e o item um?
  Resposta:
  Resposta do item um.
  2. O que e o item dois?
  Resposta:
  Resposta do item dois.
  3. O que e o item tres?
  Resposta:
  Resposta do item tres.
  4. O que e o item quatro?
  Resposta:
  Resposta do item quatro.

  BLOCO 2 - AVANCADO
  5. O que e o item cinco?
  Resposta:
  Resposta do item cinco.
  6. O que e o item seis?
  Resposta:
  Resposta do item seis.
  7. O que e o item sete?
  Resposta:
  Resposta do item sete.
  8. O que e o item oito?
  Resposta:
  Resposta do item oito.

  BLOCO 3 - EXTRA
  9. O que e o item nove?
  Resposta:
  Resposta do item nove.
  10. O que e o item dez?
  Resposta:
  Resposta do item dez.
  11. O que e o item onze?
  Resposta:
  Resposta do item onze.
  12. O que e o item doze?
  Resposta:
  Resposta do item doze.
  `);

  const firstRun = withMockedRandom(
    [0.01, 0.15, 0.22, 0.35, 0.48, 0.52, 0.61, 0.73, 0.84, 0.93, 0.04, 0.17, 0.29, 0.41, 0.56, 0.68, 0.79, 0.88],
    () => generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW"),
  );
  const secondRun = withMockedRandom(
    [0.91, 0.82, 0.74, 0.66, 0.58, 0.49, 0.37, 0.25, 0.13, 0.02, 0.95, 0.86, 0.77, 0.69, 0.57, 0.44, 0.31, 0.18],
    () => generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW"),
  );

  assert.equal(firstRun.questions.length, 10);
  assert.equal(secondRun.questions.length, 10);

  const firstRunPrompts = firstRun.questions.map((question) => normalizeForComparison(question.prompt));
  const secondRunPrompts = secondRun.questions.map((question) => normalizeForComparison(question.prompt));

  assert.notDeepEqual(firstRunPrompts, secondRunPrompts);
  assert.ok(firstRunPrompts.some((prompt) => prompt.includes("item dez") || prompt.includes("item onze") || prompt.includes("item doze")));
  assert.ok(secondRunPrompts.some((prompt) => prompt.includes("item dez") || prompt.includes("item onze") || prompt.includes("item doze")));
});
