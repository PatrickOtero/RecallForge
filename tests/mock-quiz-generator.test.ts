import test from "node:test";
import assert from "node:assert/strict";

import { cleanExtractedText } from "@/lib/normalization/text-normalizer";
import {
  detectStructuredQuestionnaire,
  generateQuizFromDocument,
  generateQuizOptions,
  MINIMUM_STRUCTURED_QUESTION_PAIRS,
  parseStructuredQuestionnaire,
} from "@/lib/quiz/mock-quiz-generator";
import type { Document, QuestionDraft } from "@/lib/types";
import { normalizeForComparison } from "@/lib/utils";
import { validateManualText } from "@/lib/validation";

function buildDocument(cleanedText: string): Document {
  return {
    id: "doc-test",
    title: "Questionario de revisao",
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

test("aceita questionarios estruturados com o minimo recomendado de pares claros", () => {
  const cleanedText = cleanExtractedText(`
  1. O que e a fotossintese?
  Resposta:
  Processo pelo qual organismos autotroficos produzem glicose usando luz.

  2. Quais sao as fases da fotossintese?
  Resposta esperada:
  Fase clara e fase escura.

  Q: Onde ocorre a fase clara?
  A: Nos tilacoides dos cloroplastos.
  `);

  assert.equal(MINIMUM_STRUCTURED_QUESTION_PAIRS, 3);
  assert.equal(validateManualText(cleanedText), null);
  assert.equal(detectStructuredQuestionnaire(cleanedText), true);

  const parsed = parseStructuredQuestionnaire(cleanedText);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]?.prompt, "O que e a fotossintese?");
  assert.match(parsed[1]?.expectedAnswer ?? "", /fase clara e fase escura/i);
  assert.match(parsed[2]?.expectedAnswer ?? "", /tilacoides/i);
});

test("trata P/R e secoes em colchetes sem vazar prefixos na multipla escolha", () => {
  const cleanedText = cleanExtractedText(`
  [Roubos, assaltos e salvaguarda de imagens]

  P: Qual expressao e indicada em abordagem corretiva?
  R: O Senhor/Senhora esqueceu-se de registrar o produto tal.

  P: Quem deve fazer a coleta de imagens quando houver solicitacao legal?
  R: A coleta deve ser feita apenas por responsavel autorizado, seguindo a solicitacao formal.

  P: O que deve ser feito alem de salvar imagens de ocorrencias relevantes?
  R: O registro precisa ser documentado e preservado com identificacao da ocorrencia.

  P: Por que o AEP/AP deve conhecer metodos de furto?
  R: Para reconhecer comportamentos suspeitos e agir com seguranca e padrao.

  [Faixas de reposicao e sugestao de pedido]

  P: No exemplo do biscoito com embalagem 42 e saida media 3, qual e a cobertura aproximada e a faixa de reposicao?
  R: A cobertura e 14 dias, portanto maior que 11 dias, enquadrando o item em 30% de reposicao.

  P: No exemplo do produto com estoque 35 e saida media 5, qual e a cobertura aproximada e a faixa de reposicao?
  R: A cobertura e 7 dias, portanto maior que 5 e menor que 11 dias, enquadrando o item em 50% de reposicao.

  P: No exemplo do item com estoque 21 e saida media 5, qual e a cobertura aproximada e a faixa de reposicao?
  R: A cobertura e 4,2 dias, portanto menor que 5 dias, enquadrando o item em 95% de reposicao.

  P: Como calcular o estoque padrao final quando a saida media e 50 e a cobertura e 5?
  R: O estoque padrao final e 250, pois 50 * 5 = 250.
  `);

  const parsed = parseStructuredQuestionnaire(cleanedText);
  assert.equal(parsed.length, 8);
  assert.equal(parsed[0]?.sectionTitle, "Roubos, Assaltos E Salvaguarda De Imagens");
  assert.equal(parsed[0]?.prompt, "Qual expressao e indicada em abordagem corretiva?");
  assert.equal(parsed[0]?.expectedAnswer, "O Senhor/Senhora esqueceu-se de registrar o produto tal.");
  assert.equal(parsed[4]?.sectionTitle, "Faixas De Reposicao E Sugestao De Pedido");

  const exam = generateQuizFromDocument(buildDocument(cleanedText), "EXAM", "MULTIPLE_CHOICE_ONLY");

  const abordagem = findQuestion(exam.questions, "qual expressao e indicada em abordagem corretiva");
  assert.ok(abordagem);
  assert.equal(abordagem?.type, "MULTIPLE_CHOICE");
  assert.equal(abordagem?.prompt, "Qual expressao e indicada em abordagem corretiva?");
  assert.equal(abordagem?.correctAnswer, "O Senhor/Senhora esqueceu-se de registrar o produto tal.");

  const biscoito = findQuestion(exam.questions, "no exemplo do biscoito com embalagem 42 e saida media 3");
  assert.ok(biscoito);
  assert.equal(biscoito?.type, "MULTIPLE_CHOICE");
  assert.equal(
    biscoito?.prompt,
    "No exemplo do biscoito com embalagem 42 e saida media 3, qual e a cobertura aproximada e a faixa de reposicao?",
  );
  assert.equal(
    biscoito?.correctAnswer,
    "A cobertura e 14 dias, portanto maior que 11 dias, enquadrando o item em 30% de reposicao.",
  );

  for (const question of exam.questions) {
    assert.ok(!question.prompt.includes("P:"));
    assert.ok(!question.prompt.includes("R:"));

    if (question.type === "MULTIPLE_CHOICE" && question.choices) {
      assert.equal(question.choices.length, 4);
      assert.equal(
        question.choices.filter((choice) => choice.label === question.correctAnswer).length,
        1,
      );

      for (const choice of question.choices) {
        assert.ok(!choice.label.includes("P:"));
        assert.ok(!choice.label.includes("R:"));
        assert.ok(!choice.label.trim().endsWith("?"));
      }
    }
  }
});

test("importa questionarios estruturados sem inventar perguntas novas", () => {
  const cleanedText = cleanExtractedText(`
  Use da seguinte forma:
  1. Tente responder sem olhar a resposta.
  2. Confira o gabarito logo abaixo.

  BLOCO 1 - FICHA DE DEGUSTACAO

  1. Quais sao as cinco partes principais da ficha de degustacao e quantos pontos vale cada uma?
  Resposta:
  Exame visual - 5 pontos.
  Exame olfativo - 5 pontos.
  Exame gustativo - 5 pontos.
  Observacoes, sensacoes finais e evolucao - 3 pontos.
  Harmonizacao - 2 pontos.

  2. O que deve ser registrado na parte de observacoes finais?
  Resposta:
  Sensacoes persistentes, equilibrio do vinho e sua evolucao na taca.

  3. Como a harmonizacao deve ser avaliada na ficha?
  Resposta:
  Pela coerencia entre prato e vinho, considerando intensidade, textura e persistencia.

  BLOCO 2 - EXAME VISUAL

  4. Qual regiao da taca deve ser observada primeiro no exame visual?
  Resposta:
  O centro e depois a borda, para perceber intensidade e evolucao da cor.

  5. O que a limpidez indica no exame visual?
  Resposta:
  Se o vinho esta brilhante, limpo e sem particulas em suspensao.

  6. Quais castas tintas sao mais tradicionais em Bordeaux?
  Resposta:
  Cabernet Sauvignon, Merlot, Cabernet Franc, Petit Verdot e Malbec.
  `);

  const deepDive = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE", "AUTO");
  const quickReview = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");
  const flashcards = generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS");

  assert.ok(findQuestion(deepDive.questions, "cinco partes principais da ficha de degustacao"));
  assert.ok(quickReview.questions.some((question) => ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"].includes(question.type)));
  assert.ok(findQuestion(flashcards.questions, "limpidez indica"));

  for (const question of [...deepDive.questions, ...quickReview.questions, ...flashcards.questions]) {
    assert.ok(!/resuma em uma frase|que problema .* ajuda a resolver|qual alternativa descreve corretamente/i.test(question.prompt));
    assert.ok(!/use da seguinte forma|tente responder sem olhar|confira o gabarito/i.test(question.prompt));
  }
});

test("separa modo de estudo e composicao dos tipos de pergunta", () => {
  const cleanedText = cleanExtractedText(`
  [Fundamentos da gestao de estoques]
  P: O que e ruptura?
  R: E a falta de um produto no momento da compra pelo consumidor.

  P: O que a cobertura de estoque mede?
  R: Mede por quantos dias o estoque atual atende a demanda futura.

  P: O que o relatorio de produtos nao atendidos verifica?
  R: Verifica itens sugeridos para a loja que nao foram enviados pelo CD.

  P: Como a saida media e calculada?
  R: Ela considera o historico de vendas para estimar a media diaria de cada item.

  [Faixas de reposicao]
  P: No exemplo com estoque 35 e saida media 5, qual e a faixa de reposicao?
  R: A cobertura e 7 dias, entao a faixa de reposicao fica em 50%.

  P: No exemplo com estoque 21 e saida media 5, qual e a faixa de reposicao?
  R: A cobertura e 4,2 dias, entao a faixa de reposicao fica em 95%.

  P: No exemplo com estoque 42 e saida media 3, qual e a faixa de reposicao?
  R: A cobertura e 14 dias, entao a faixa de reposicao fica em 30%.

  P: Como calcular o estoque padrao final?
  R: Multiplicando a saida media pela cobertura definida para o item.
  `);

  const quickReviewAuto = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "AUTO");
  const quickReviewMcOnly = generateQuizFromDocument(buildDocument(cleanedText), "QUICK_REVIEW", "MULTIPLE_CHOICE_ONLY");
  const deepDiveAuto = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE", "AUTO");
  const deepDiveDiscursive = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE", "DISCURSIVE_ONLY");
  const feynmanForced = generateQuizFromDocument(buildDocument(cleanedText), "FEYNMAN", "MULTIPLE_CHOICE_ONLY");

  assert.ok(quickReviewAuto.questions.some((question) => question.type === "MULTIPLE_CHOICE"));
  assert.ok(
    quickReviewAuto.questions.some(
      (question) => question.type === "TRUE_FALSE" || question.type === "FILL_BLANK" || question.responseFormat === "SHORT",
    ),
  );

  assert.ok(quickReviewMcOnly.questions.length > 0);
  assert.ok(quickReviewMcOnly.questions.every((question) => question.type === "MULTIPLE_CHOICE"));

  assert.ok(deepDiveAuto.questions.some((question) => question.type === "MULTIPLE_CHOICE"));
  assert.ok(
    deepDiveAuto.questions.some(
      (question) => question.type === "SHORT_ANSWER" && (question.responseFormat === "SHORT" || question.responseFormat === "LONG"),
    ),
  );

  assert.ok(deepDiveDiscursive.questions.every((question) => question.type === "SHORT_ANSWER"));
  assert.ok(deepDiveDiscursive.questions.some((question) => question.responseFormat === "LONG"));

  assert.equal(feynmanForced.composition, "DISCURSIVE_ONLY");
  assert.ok(feynmanForced.questions.every((question) => question.type === "SHORT_ANSWER"));
  assert.ok(feynmanForced.questions.every((question) => question.responseFormat === "LONG"));
  assert.ok(feynmanForced.questions.every((question) => /^Explique com suas palavras:/i.test(question.prompt)));

  const options = generateQuizOptions(buildDocument(cleanedText));
  const quickReviewOption = options.find((option) => option.mode === "QUICK_REVIEW");
  const feynmanOption = options.find((option) => option.mode === "FEYNMAN");

  assert.equal(quickReviewOption?.compositionOptions.length, 3);
  assert.equal(feynmanOption?.compositionOptions.length, 1);
  assert.equal(feynmanOption?.compositionOptions[0]?.composition, "DISCURSIVE_ONLY");
});

test("trata blocos de associacao sem carregar a instrucao para o prompt individual", () => {
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
  `);

  const parsed = parseStructuredQuestionnaire(cleanedText);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0]?.promptStyle, "ASSOCIATION");
  assert.equal(parsed[0]?.associationItem, "Provence");

  const deepDive = generateQuizFromDocument(buildDocument(cleanedText), "DEEP_DIVE");
  const flashcards = generateQuizFromDocument(buildDocument(cleanedText), "FLASHCARDS");
  const exam = generateQuizFromDocument(buildDocument(cleanedText), "EXAM", "MULTIPLE_CHOICE_ONLY");

  const shortAnswer = findQuestion(deepDive.questions, "provence esta associada a que");
  assert.ok(shortAnswer);
  assert.match(shortAnswer?.correctAnswer ?? "", /lider francesa e mundial/i);

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
});

test("sorteia perguntas do banco inteiro em vez de repetir sempre o inicio do questionario", () => {
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

  const firstRunPrompts = firstRun.questions.map((question) => normalizeForComparison(question.prompt));
  const secondRunPrompts = secondRun.questions.map((question) => normalizeForComparison(question.prompt));

  assert.equal(firstRun.questions.length, 10);
  assert.equal(secondRun.questions.length, 10);
  assert.notDeepEqual(firstRunPrompts, secondRunPrompts);
  assert.ok(firstRunPrompts.some((prompt) => prompt.includes("item dez") || prompt.includes("item onze") || prompt.includes("item doze")));
  assert.ok(secondRunPrompts.some((prompt) => prompt.includes("item dez") || prompt.includes("item onze") || prompt.includes("item doze")));
});

test("nao gera mais perguntas a partir de material bruto", () => {
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
