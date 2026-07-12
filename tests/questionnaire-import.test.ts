import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildImportReport,
  convertImportCandidatesToQuestionDrafts,
  createOptionId,
  ensureUniqueOptionIds,
  hydrateImportCandidate,
  normalizeQuestionnaireInput,
  prepareImportSelection,
  validateImportCandidate,
} from "@/lib/questionnaire-import";
import type { ImportCandidate } from "@/lib/questionnaire-import";
import { evaluateAnswer } from "@/lib/quiz/evaluation";
import { buildQuizModeOptionsFromQuestionDrafts } from "@/lib/quiz-session/from-question-drafts";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "questionnaires");

function readFixture(fileName: string) {
  return fs.readFileSync(path.join(fixturesDir, fileName), "utf8");
}

function buildMultipleChoiceCandidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return hydrateImportCandidate({
    id: "candidate-1",
    sourceIndex: 1,
    rawBlock: "Pergunta\nA) Opcao 1\nB) Opcao 2",
    parserName: "manual-test",
    detectedType: "MULTIPLE_CHOICE",
    confidence: 0.3,
    warnings: [],
    question: "Qual alternativa deve ser marcada?",
    options: [
      { id: "option-a", text: "Primeira opcao", isCorrect: false },
      { id: "option-b", text: "Segunda opcao", isCorrect: true },
    ],
    selected: false,
    reviewStatus: "REJECTED",
    validationErrors: [],
    ...overrides,
  });
}

test("parseia P/R e Q/A com alta confianca", () => {
  const report = buildImportReport(readFixture("pr-basic.txt"));
  const qaReport = buildImportReport(readFixture("q-a.txt"));

  assert.equal(report.totalCandidates, 2);
  assert.equal(report.highConfidence, 2);
  assert.equal(report.candidates[0]?.detectedType, "REVEAL_ANSWER");
  assert.equal(qaReport.candidates[0]?.detectedType, "REVEAL_ANSWER");
});

test("detecta multipla escolha com gabarito inline e gabarito final", () => {
  const inlineReport = buildImportReport(readFixture("multiple-choice-inline-key.txt"));
  const finalKeyReport = buildImportReport(readFixture("multiple-choice-final-key.txt"));

  assert.equal(inlineReport.candidates[0]?.detectedType, "MULTIPLE_CHOICE");
  assert.equal(inlineReport.highConfidence, 1);
  assert.equal(finalKeyReport.totalCandidates, 2);
  assert.equal(finalKeyReport.needsReview, 2);
  assert.equal(finalKeyReport.candidates[0]?.options?.find((option) => option.isCorrect)?.text, "Sistemática 1");
});

test("detecta multipla selecao e corrige pelo conjunto de respostas", () => {
  const report = buildImportReport(readFixture("multi-select.txt"));
  const drafts = convertImportCandidatesToQuestionDrafts(report.candidates);
  const question = drafts[0];

  assert.equal(question?.type, "MULTI_SELECT");

  const evaluation = evaluateAnswer(
    {
      id: "multi-select",
      sessionId: "session",
      type: "MULTI_SELECT",
      position: 1,
      prompt: question!.prompt,
      topic: question!.topic,
      choices: question!.choices,
      correctAnswer: question!.correctAnswer,
      explanation: question!.explanation,
    },
    JSON.stringify(
      question!.choices
        ?.filter((choice) => choice.isCorrect)
        .map((choice) => choice.id),
    ),
  );

  assert.equal(report.candidates[0]?.detectedType, "MULTI_SELECT");
  assert.equal(evaluation.isCorrect, true);
  assert.equal(evaluation.score, 1);
});

test("detecta verdadeiro ou falso, associacao, flashcards e lacunas", () => {
  const trueFalse = buildImportReport(readFixture("true-false.txt"));
  const matching = buildImportReport(readFixture("matching-columns.txt"));
  const flashcards = buildImportReport(readFixture("flashcards.txt"));
  const fillBlank = buildImportReport(readFixture("fill-blank.txt"));

  assert.equal(trueFalse.candidates[0]?.detectedType, "TRUE_FALSE");
  assert.equal(matching.candidates[0]?.detectedType, "MATCHING");
  assert.equal(matching.candidates[0]?.matchingPairs?.length, 2);
  assert.equal(flashcards.totalCandidates, 2);
  assert.ok(flashcards.candidates.every((candidate) => candidate.detectedType === "FLASHCARD"));
  assert.equal(fillBlank.candidates[0]?.detectedType, "FILL_BLANK");
});

test("limpa ruido de HTML copiado sem destruir a resposta", () => {
  const normalized = normalizeQuestionnaireInput(readFixture("copied-html-noise.txt"));
  const report = buildImportReport(readFixture("copied-html-noise.txt"));

  assert.equal(normalized.includes("Mostrar resposta"), false);
  assert.equal(report.totalCandidates, 1);
  assert.equal(report.candidates[0]?.answer, "Relatório de produtos não atendidos.");
});

test("mantem Unicode e marca conteudo ambiguo como rejeitado", () => {
  const unicodeReport = buildImportReport(readFixture("unicode-content.txt"));
  const malformedReport = buildImportReport(readFixture("malformed-questionnaire.txt"));

  assert.ok(unicodeReport.candidates.some((candidate) => candidate.question?.includes("Château-Chalon")));
  assert.ok(unicodeReport.candidates.some((candidate) => candidate.answer?.includes("Gewürztraminer") || candidate.question?.includes("Gewürztraminer")));
  assert.ok(malformedReport.rejected >= 1);
});

test("monta opcoes de estudo a partir das questoes confirmadas", () => {
  const report = buildImportReport(readFixture("mixed-formats.txt"));
  const drafts = convertImportCandidatesToQuestionDrafts(report.candidates);
  const options = buildQuizModeOptionsFromQuestionDrafts(drafts);

  assert.ok(options.find((option) => option.mode === "QUICK_REVIEW")?.available);
  assert.ok(options.find((option) => option.mode === "DEEP_DIVE")?.available);
  assert.ok(options.find((option) => option.mode === "FLASHCARDS")?.available);
  assert.equal(drafts.some((question) => question.type === "REVEAL_ANSWER"), true);
  assert.equal(drafts.some((question) => question.type === "MULTIPLE_CHOICE"), true);
  assert.equal(drafts.some((question) => question.type === "MATCHING"), true);
});

test("corrige ids duplicados de alternativas sem perder o gabarito", () => {
  const candidate = buildMultipleChoiceCandidate({
    options: [
      { id: "option-4", text: "Primeira opcao", isCorrect: false },
      { id: "option-4", text: "Segunda opcao", isCorrect: true },
    ],
  });

  const normalized = ensureUniqueOptionIds(candidate).candidate;
  const optionIds = normalized.options?.map((option) => option.id) ?? [];

  assert.equal(new Set(optionIds).size, optionIds.length);
  assert.equal(normalized.options?.filter((option) => option.isCorrect).length, 1);
  assert.equal(normalized.options?.find((option) => option.isCorrect)?.text, "Segunda opcao");
});

test("gera ids unicos ao adicionar e re-adicionar alternativas", () => {
  const candidate = buildMultipleChoiceCandidate();
  const firstId = createOptionId(candidate.id);
  const secondId = createOptionId(candidate.id);
  const removedId = candidate.options?.[0]?.id;
  const remainingIds = new Set((candidate.options ?? []).slice(1).map((option) => option.id));

  assert.notEqual(firstId, secondId);
  assert.notEqual(firstId, removedId);
  assert.equal(remainingIds.has(firstId), false);
  assert.equal(remainingIds.has(secondId), false);
});

test("permite importar questao corrigida e aprovada manualmente mesmo com baixa confianca", () => {
  const prepared = prepareImportSelection([
    buildMultipleChoiceCandidate({
      reviewStatus: "CONFIRMED",
      selected: true,
    }),
  ]);

  assert.equal(prepared.importableCandidates.length, 1);
  assert.equal(prepared.importableCandidates[0]?.reviewStatus, "CONFIRMED");
  assert.equal(prepared.issues.length, 0);
});

test("bloqueia importacao quando a questao selecionada ainda nao foi aprovada", () => {
  const prepared = prepareImportSelection([
    buildMultipleChoiceCandidate({
      reviewStatus: "PENDING",
      selected: true,
    }),
  ]);

  assert.equal(prepared.importableCandidates.length, 0);
  assert.deepEqual(prepared.issues, [
    {
      candidateId: "candidate-1",
      message: "A questão precisa ser aprovada.",
    },
  ]);
});

test("bloqueia aprovacao quando falta gabarito", () => {
  const validation = validateImportCandidate(
    buildMultipleChoiceCandidate({
      reviewStatus: "CONFIRMED",
      selected: true,
      options: [
        { id: "option-a", text: "Primeira opcao", isCorrect: false },
        { id: "option-b", text: "Segunda opcao", isCorrect: false },
      ],
    }),
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.includes("Marque uma alternativa como gabarito."), true);
});

test("detecta questionario numerado com gabarito final separado", () => {
  const report = buildImportReport(readFixture("vestibular-final-answer-key.txt"));
  const firstQuestion = report.candidates.find((candidate) => candidate.sourceNumber === "1");

  assert.equal(report.detectedFormat, "NUMBERED_QUESTIONNAIRE_WITH_FINAL_ANSWER_KEY");
  assert.equal(report.totalCandidates, 2);
  assert.equal(firstQuestion?.detectedType, "MULTIPLE_CHOICE");
  assert.equal(firstQuestion?.options?.find((option) => option.isCorrect)?.label, "B");
});

test("mantem uma unica questao quando o enunciado e as alternativas atravessam paginas", () => {
  const report = buildImportReport(readFixture("vestibular-page-break.txt"));
  const firstQuestion = report.candidates.find((candidate) => candidate.sourceNumber === "1");

  assert.equal(report.totalCandidates, 2);
  assert.equal(firstQuestion?.question?.includes("A figura representa as fases da lua"), true);
  assert.equal(firstQuestion?.options?.length, 5);
  assert.equal(firstQuestion?.sourcePageStart, 1);
  assert.equal(firstQuestion?.sourcePageEnd, 2);
});

test("detecta julgamento por itens sem transformar 01 02 04 08 16 em questoes principais", () => {
  const report = buildImportReport(readFixture("vestibular-statement-judgement.txt"));
  const statementQuestion = report.candidates.find((candidate) => candidate.sourceNumber === "8");

  assert.equal(report.totalCandidates, 2);
  assert.equal(statementQuestion?.detectedType, "STATEMENT_JUDGEMENT");
  assert.equal(statementQuestion?.options?.length, 5);
  assert.equal(statementQuestion?.options?.filter((option) => option.isCorrect).length, 3);
});

test("converte discursivas com a e b em subquestoes revelar resposta relacionadas", () => {
  const report = buildImportReport(readFixture("vestibular-discursive-parts.txt"));
  const grouped = report.candidates.filter((candidate) => candidate.parentSourceNumber === "5");

  assert.equal(report.totalCandidates, 4);
  assert.deepEqual(grouped.map((candidate) => candidate.sourceNumber), ["5a", "5b"]);
  assert.equal(grouped.every((candidate) => candidate.detectedType === "REVEAL_ANSWER"), true);
  assert.equal(grouped[0]?.answer?.includes("triangulacao"), true);
});

test("preserva dependencia visual e contexto de tabela sem rejeitar automaticamente", () => {
  const report = buildImportReport(readFixture("vestibular-visual-context.txt"));
  const figureQuestion = report.candidates.find((candidate) => candidate.sourceNumber === "3");
  const tableQuestion = report.candidates.find((candidate) => candidate.sourceNumber === "11");

  assert.equal(figureQuestion?.requiresVisualContext, true);
  assert.equal(tableQuestion?.requiresVisualContext, true);
  assert.equal((tableQuestion?.contextBlocks?.length ?? 0) >= 1, true);
  assert.equal(tableQuestion?.reviewStatus === "REJECTED", false);
});
