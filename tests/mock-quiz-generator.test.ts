import test from "node:test";
import assert from "node:assert/strict";

import { cleanExtractedText } from "@/lib/normalization/text-normalizer";
import { computeStudyBankCapabilities, parseMatchingQuestionDrafts } from "@/lib/quiz-parser";
import { getAvailableModes } from "@/lib/quiz-session/mode-compatibility";
import {
  detectStructuredQuestionnaire,
  generateQuizFromDocument,
  generateQuizOptions,
  MINIMUM_STRUCTURED_QUESTION_PAIRS,
  parseStructuredQuestionnaire,
  stripQuestionnaireLabel,
} from "@/lib/quiz/mock-quiz-generator";
import type { Document, QuestionDraft } from "@/lib/types";
import { normalizeForComparison } from "@/lib/utils";
import { validateManualText } from "@/lib/validation";

function buildDocument(cleanedText: string): Document {
  return {
    id: "doc-test",
    title: "Questionário de revisão",
    sourceType: "MANUAL_TEXT",
    originalFileName: null,
    mimeType: null,
    rawText: cleanedText,
    cleanedText,
    chunkCount: 1,
    createdAt: new Date("2026-07-01T00:00:00.000Z").toISOString(),
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

test("aceita P/R, Pergunta/Resposta e Q/A como perguntas de resposta revelada", () => {
  const cleanedText = cleanExtractedText(`
  P: O que e ruptura?
  R: Falta de produto no momento da compra.

  Pergunta: Como e calculada a cobertura de estoque?
  Resposta: Estoque do produto dividido pela saida media.

  Q: O que o inventario confronta?
  A: Estoque fisico e estoque logico.
  `);

  assert.equal(MINIMUM_STRUCTURED_QUESTION_PAIRS, 3);
  assert.equal(validateManualText(cleanedText), null);
  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const parsed = parseStructuredQuestionnaire(cleanedText);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]?.prompt, "O que e ruptura?");
  assert.match(parsed[1]?.expectedAnswer ?? "", /saida media/i);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "FEYNMAN", "DISCURSIVE_ONLY");
  assert.ok(review.questions.length > 0);
  assert.ok(review.questions.every((question) => question.type === "REVEAL_ANSWER"));
});

test("nao converte P/R comum em verdadeiro/falso artificial", () => {
  const cleanedText = cleanExtractedText(`
  P: Aula 21 - Que barreira natural protege os vinhedos de Bordeaux contra ventos e tempestades atlanticas?
  R: A barreira florestal de pinheiros.

  P: Qual rio divide a margem esquerda e a margem direita em Bordeaux?
  R: O rio Gironde.

  P: Que uva tinta domina a margem esquerda?
  R: Cabernet Sauvignon.

  P: Que uva tinta domina a margem direita?
  R: Merlot.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");

  assert.ok(review.questions.length > 0);
  assert.ok(review.questions.every((question) => question.type !== "TRUE_FALSE"));
  assert.equal(
    review.questions.some((question) => question.prompt === "Verdadeiro ou falso: A barreira florestal de pinheiros."),
    false,
  );
});

test("aceita P/R como verdadeiro/falso apenas quando a pergunta e explicitamente V/F", () => {
  const cleanedText = cleanExtractedText(`
  P: Verdadeiro ou falso: Ruptura significa falta de produto no momento da compra pelo consumidor.
  R: Verdadeiro.

  P: Certo ou errado: O inventario confronta estoque fisico com estoque logico.
  R: Certo.

  P: V/F: O estoque fisico e sempre igual ao estoque logico.
  R: Falso.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");
  const trueFalseQuestions = review.questions.filter((question) => question.type === "TRUE_FALSE");

  assert.equal(trueFalseQuestions.length, 3);
  assert.ok(trueFalseQuestions.some((question) => question.correctAnswer === "false"));
  assert.ok(trueFalseQuestions.every((question) => !question.prompt.startsWith("P:")));
});

test("rejeita verdadeiro/falso explicito quando a afirmacao e so uma resposta curta nominal", () => {
  const cleanedText = cleanExtractedText(`
  Verdadeiro ou falso:
  A barreira florestal de pinheiros.
  Resposta: Verdadeiro

  2. Riesling. (V)

  C/E:
  Cerca de 15% dos vinhedos.
  Resposta: C
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), false);
  assert.equal(generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO").questions.length, 0);
});

test("remove apenas prefixos explicitos sem cortar letras reais nem destruir Unicode", () => {
  assert.equal(stripQuestionnaireLabel("R: Riesling"), "Riesling");
  assert.equal(stripQuestionnaireLabel("Resposta: Riesling"), "Riesling");
  assert.equal(stripQuestionnaireLabel("Riesling"), "Riesling");
  assert.equal(stripQuestionnaireLabel("Roussillon"), "Roussillon");
  assert.equal(stripQuestionnaireLabel("Regiao do Jura"), "Regiao do Jura");
  assert.equal(stripQuestionnaireLabel("Ruptura"), "Ruptura");
  assert.equal(stripQuestionnaireLabel("P: O que e ruptura?"), "O que e ruptura?");
  assert.equal(stripQuestionnaireLabel("Pergunta: O que e ruptura?"), "O que e ruptura?");

  const unicode = "Château-Chalon, Gewürztraminer, São João, Roussillon";
  assert.equal(stripQuestionnaireLabel(unicode), unicode);
});

test("preserva multipla escolha pronta com gabarito em vez de gerar novos distratores", () => {
  const cleanedText = cleanExtractedText(`
  1. O que e ruptura?
  A) Excesso de produto em estoque.
  B) Falta de produto no momento da compra pelo consumidor.
  C) Transferencia interna entre setores.
  D) Contagem fisica das mercadorias.
  Gabarito: B
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const multipleChoice = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE", "MULTIPLE_CHOICE_ONLY");
  assert.equal(multipleChoice.questions.length, 1);

  const question = multipleChoice.questions[0];
  assert.equal(question?.type, "MULTIPLE_CHOICE");
  assert.equal(question?.prompt, "O que e ruptura?");
  assert.equal(question?.choices?.length, 4);
  assert.equal(question?.correctAnswer, "Falta de produto no momento da compra pelo consumidor.");
});

test("parseia verdadeiro/falso e certo/errado com correcao objetiva", () => {
  const cleanedText = cleanExtractedText(`
  Verdadeiro ou falso:
  Ruptura significa falta de produto no momento da compra pelo consumidor.
  Resposta: Verdadeiro

  2. O inventario ignora o estoque fisico. (F)

  Certo ou errado:
  O inventario confronta estoque fisico com estoque logico.
  Gabarito: Certo
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");
  const trueFalseQuestions = review.questions.filter((question) => question.type === "TRUE_FALSE");

  assert.ok(trueFalseQuestions.length >= 3);
  assert.ok(trueFalseQuestions.some((question) => question.correctAnswer === "true"));
  assert.ok(trueFalseQuestions.some((question) => question.correctAnswer === "false"));
});

test("transforma associacao item/resposta em uma questao MATCHING", () => {
  const cleanedText = cleanExtractedText(`
  BLOCO 14 - QUESTOES DE ASSOCIACAO

  Associe cada item a resposta correta.

  1. Provence
  Resposta:
  Lider francesa e mundial em roses secos e frutados.

  2. Roussillon
  Resposta:
  Regiao associada a producao de VDN.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");
  const matching = review.questions.find((question) => question.type === "MATCHING");

  assert.ok(matching);
  assert.equal(matching?.prompt, "Associe cada item à descrição correta.");
  assert.equal(matching?.matchingPairs?.length, 2);
  assert.deepEqual(
    matching?.matchingPairs?.map((pair) => pair.left),
    ["Provence", "Roussillon"],
  );
});

test("parseia associacao em colunas com gabarito", () => {
  const cleanedText = cleanExtractedText(`
  Associe:

  Coluna A
  A) Provence
  B) Roussillon
  C) Château-Chalon

  Coluna B
  1) Regiao associada a producao de VDN.
  2) Lider francesa e mundial em roses secos e frutados.
  3) Denominacao do Jura dedicada ao Vin Jaune.

  Gabarito:
  A-2
  B-1
  C-3
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");
  const matching = review.questions.find((question) => question.type === "MATCHING");

  assert.ok(matching);
  assert.equal(matching?.matchingPairs?.length, 3);
  assert.equal(matching?.matchingPairs?.find((pair) => pair.left === "Château-Chalon")?.right, "Denominacao do Jura dedicada ao Vin Jaune.");
});

test("parseia associacao explicita com pares em seta", () => {
  const drafts = parseMatchingQuestionDrafts(`
  [ASSOCIACAO]
  Instrucao: Associe cada item a descricao correta.
  1. Provence => Lider francesa e mundial em roses secos e frutados.
  2. Roussillon => Regiao associada a producao de VDN.
  `);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.type, "MATCHING");
  assert.equal(drafts[0]?.matchingPairs?.length, 2);
  assert.deepEqual(drafts[0]?.matchingPairs?.map((pair) => pair.left), ["Provence", "Roussillon"]);
});

test("parseia associacao explicita com pares em hifen", () => {
  const drafts = parseMatchingQuestionDrafts(`
  [ASSOCIAÇÃO]
  1. Provence - Lider francesa e mundial em roses secos e frutados.
  2. Roussillon - Regiao associada a producao de VDN.
  `);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.type, "MATCHING");
  assert.equal(drafts[0]?.matchingPairs?.length, 2);
});

test("parseia associacao explicita com item e resposta", () => {
  const drafts = parseMatchingQuestionDrafts(`
  [ASSOCIACAO]
  1. Provence
  Resposta: Lider francesa e mundial em roses secos e frutados.

  2. Roussillon
  Resposta: Regiao associada a producao de VDN.
  `);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.type, "MATCHING");
  assert.equal(drafts[0]?.matchingPairs?.length, 2);
  assert.equal(drafts[0]?.matchingPairs?.[0]?.right.includes("Resposta:"), false);
});

test("parseia associacao explicita em colunas com gabarito", () => {
  const drafts = parseMatchingQuestionDrafts(`
  [ASSOCIACAO]
  Coluna A
  A) Provence
  B) Roussillon

  Coluna B
  1) Regiao associada a producao de VDN.
  2) Lider francesa e mundial em roses secos e frutados.

  Gabarito:
  A-2
  B-1
  `);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.type, "MATCHING");
  assert.equal(drafts[0]?.matchingPairs?.length, 2);
  assert.equal(
    drafts[0]?.matchingPairs?.find((pair) => pair.left === "Provence")?.right,
    "Lider francesa e mundial em roses secos e frutados.",
  );
});

test("capabilities habilitam e bloqueiam modos por tipo disponivel", () => {
  const matchingOnly = computeStudyBankCapabilities(parseMatchingQuestionDrafts(`
  [ASSOCIACAO]
  1. Provence => Lider francesa e mundial em roses secos e frutados.
  2. Roussillon => Regiao associada a producao de VDN.
  `));
  const modes = getAvailableModes(matchingOnly);

  assert.equal(matchingOnly.matching, 1);
  assert.equal(modes.find((mode) => mode.mode === "FLASHCARDS")?.available, true);
  assert.equal(modes.find((mode) => mode.mode === "EXAM")?.available, false);
  assert.equal(modes.find((mode) => mode.mode === "DEEP_DIVE")?.available, false);
});

test("parseia frente/verso e termo/definicao como itens revelaveis quando ha volume minimo", () => {
  const cleanedText = cleanExtractedText(`
  Frente: Ruptura
  Verso: Falta de produto no momento da compra pelo consumidor.

  Termo: Gewürztraminer
  Definicao: Casta branca aromatica de perfil intenso.

  Frente:
  São João
  Verso:
  Nome preservado com acento e espaco.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const reveal = generateQuizFromDocument(buildDocument(cleanedText), "FEYNMAN");
  assert.equal(reveal.questions.length, 3);
  assert.ok(reveal.questions.every((question) => question.type === "FLASHCARD" || question.type === "REVEAL_ANSWER"));
  assert.ok(findQuestion(reveal.questions, "Gewurztraminer"));
  assert.ok(reveal.questions.some((question) => question.prompt === "São João"));
});

test("parseia lista de perguntas com gabarito ao final como revelar resposta", () => {
  const cleanedText = cleanExtractedText(`
  1. O que e ruptura?
  2. O que e inventario?
  3. Como e calculada a cobertura de estoque?

  Gabarito:
  1. Falta de produto no momento da compra pelo consumidor.
  2. Contagem fisica confrontada com estoque logico.
  3. Estoque do produto dividido pela saida media.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const review = generateQuizFromDocument(buildDocument(cleanedText), "FEYNMAN", "DISCURSIVE_ONLY");
  assert.equal(review.questions.length, 3);
  assert.ok(review.questions.every((question) => question.type === "REVEAL_ANSWER"));
  assert.ok(review.questions.some((question) => question.prompt === "O que e ruptura?"));
});

test("sorteia perguntas da totalidade do questionario em vez de repetir sempre o inicio", () => {
  const cleanedText = cleanExtractedText(`
  BLOCO 1 - BASE
  1. O que e o item um?
  Resposta: Resposta do item um.
  2. O que e o item dois?
  Resposta: Resposta do item dois.
  3. O que e o item tres?
  Resposta: Resposta do item tres.
  4. O que e o item quatro?
  Resposta: Resposta do item quatro.

  BLOCO 2 - AVANCADO
  5. O que e o item cinco?
  Resposta: Resposta do item cinco.
  6. O que e o item seis?
  Resposta: Resposta do item seis.
  7. O que e o item sete?
  Resposta: Resposta do item sete.
  8. O que e o item oito?
  Resposta: Resposta do item oito.

  BLOCO 3 - EXTRA
  9. O que e o item nove?
  Resposta: Resposta do item nove.
  10. O que e o item dez?
  Resposta: Resposta do item dez.
  11. O que e o item onze?
  Resposta: Resposta do item onze.
  12. O que e o item doze?
  Resposta: Resposta do item doze.
  `);

  const firstRun = withMockedRandom(
    [0.01, 0.15, 0.22, 0.35, 0.48, 0.52, 0.61, 0.73, 0.84, 0.93, 0.04, 0.17],
    () => generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW"),
  );
  const secondRun = withMockedRandom(
    [0.91, 0.82, 0.74, 0.66, 0.58, 0.49, 0.37, 0.25, 0.13, 0.02, 0.95, 0.86],
    () => generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW"),
  );

  const firstRunPrompts = firstRun.questions.map((question) => normalizeForComparison(question.prompt));
  const secondRunPrompts = secondRun.questions.map((question) => normalizeForComparison(question.prompt));

  assert.equal(firstRun.questions.length, 10);
  assert.equal(secondRun.questions.length, 10);
  assert.notDeepEqual(firstRunPrompts, secondRunPrompts);
  assert.ok(firstRunPrompts.some((prompt) => prompt.includes("item dez") || prompt.includes("item onze") || prompt.includes("item doze")));
  assert.ok(secondRunPrompts.some((prompt) => prompt.includes("item dez") || prompt.includes("item onze") || prompt.includes("item doze")));
});

test("nao gera perguntas a partir de material bruto", () => {
  const cleanedText = cleanExtractedText(`
  Gestao de estoques organiza a reposicao e o acompanhamento dos produtos para reduzir ruptura e excesso.
  Saida media e o parametro que o sistema grava a partir do historico de vendas de cada produto.
  Cobertura de estoque mede por quantos dias o estoque atual atende a demanda futura.
  Estoque padrao final = Saida Media * Cobertura + Alocacao + Volume de Oferta.
  `);

  assert.equal(detectStructuredQuestionnaire(cleanedText), false);
  assert.equal(parseStructuredQuestionnaire(cleanedText).length, 0);
  assert.equal(generateQuizOptions(buildDocument(cleanedText)).length, 0);
  assert.equal(generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW").questions.length, 0);
  assert.equal(generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE").questions.length, 0);
  assert.equal(generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS").questions.length, 0);
});

test("descarta conversao para multipla escolha quando nao ha distratores plausiveis", () => {
  const cleanedText = cleanExtractedText(`
  [Inventario]
  P: O que e inventario rotativo?
  R: E a contagem periodica de parte dos itens para comparar estoque fisico e estoque logico.

  [Camaras frias]
  P: Como os produtos resfriados devem seguir para as camaras?
  R: Devem seguir diretamente para dentro das camaras, respeitando a cadeia de frio.

  [Etiquetas]
  P: O que as etiquetas devem permitir?
  R: Devem permitir rapida identificacao das informacoes registradas nas etiquetas.
  `);

  const multipleChoice = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE", "MULTIPLE_CHOICE_ONLY");
  assert.equal(findQuestion(multipleChoice.questions, "o que e inventario rotativo"), undefined);
});
