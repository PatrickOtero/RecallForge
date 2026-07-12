import { getImportCandidateStatus } from "@/lib/questionnaire-import/confidence";
import { detectBlockFormats } from "@/lib/questionnaire-import/detect-format";
import { looksLikeQuestionLine, normalizeTypeHeader, uniqueWarnings } from "@/lib/questionnaire-import/parser-helpers";
import { answerKeyParser, extractAnswerKeyMap } from "@/lib/questionnaire-import/parsers/answer-key.parser";
import { directQaParser } from "@/lib/questionnaire-import/parsers/direct-qa.parser";
import { explicitTypedBlockParser } from "@/lib/questionnaire-import/parsers/explicit-typed-block.parser";
import { fillBlankParser } from "@/lib/questionnaire-import/parsers/fill-blank.parser";
import { flashcardParser } from "@/lib/questionnaire-import/parsers/flashcard.parser";
import { htmlCopyParser } from "@/lib/questionnaire-import/parsers/html-copy.parser";
import { matchingParser } from "@/lib/questionnaire-import/parsers/matching.parser";
import { multipleChoiceParser } from "@/lib/questionnaire-import/parsers/multiple-choice.parser";
import { multiSelectParser } from "@/lib/questionnaire-import/parsers/multi-select.parser";
import { numberedQaParser } from "@/lib/questionnaire-import/parsers/numbered-qa.parser";
import { tableParser } from "@/lib/questionnaire-import/parsers/table.parser";
import { trueFalseParser } from "@/lib/questionnaire-import/parsers/true-false.parser";
import { parseVestibularQuestionnaire } from "@/lib/questionnaire-import/parsers/vestibular-question.parser";
import { normalizeQuestionnaireInput } from "@/lib/questionnaire-import/normalize-input";
import { hydrateImportCandidate } from "@/lib/questionnaire-import/review-state";
import { splitQuestionnaireBlocks } from "@/lib/questionnaire-import/split-blocks";
import type {
  ImportCandidate,
  ImportReport,
  QuestionnaireDocumentFormat,
  QuestionnaireParser,
} from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

const parsers: QuestionnaireParser[] = [
  explicitTypedBlockParser,
  htmlCopyParser,
  tableParser,
  matchingParser,
  multiSelectParser,
  multipleChoiceParser,
  trueFalseParser,
  flashcardParser,
  fillBlankParser,
  directQaParser,
  numberedQaParser,
];

function dedupeCandidates(candidates: ImportCandidate[]) {
  const seen = new Set<string>();
  const result: ImportCandidate[] = [];

  for (const candidate of candidates) {
    const signature =
      candidate.sourceNumber
        ? `${candidate.sourceNumber}|${candidate.detectedType}|${normalizeForComparison(candidate.question ?? candidate.rawBlock)}`
        : `${candidate.detectedType}|${normalizeForComparison(candidate.question ?? candidate.rawBlock)}|${normalizeForComparison(candidate.answer ?? "")}`;

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    result.push(candidate);
  }

  return result;
}

function createUnknownCandidate(blockIndex: number, rawBlock: string, sectionTitle?: string): ImportCandidate {
  return {
    id: `unknown-${blockIndex}`,
    sourceIndex: blockIndex,
    rawBlock,
    parserName: "fallback",
    detectedType: "UNKNOWN",
    confidence: 0.3,
    warnings: ["Nao foi possivel classificar esse bloco com seguranca."],
    question: rawBlock.split("\n")[0] ?? rawBlock,
    sectionTitle,
    selected: false,
    reviewStatus: "REJECTED",
    validationErrors: [],
  };
}

function summarizeReport(candidates: ImportCandidate[], detectedFormat: QuestionnaireDocumentFormat): ImportReport {
  const deduped = dedupeCandidates(candidates);

  return deduped.reduce<ImportReport>(
    (summary, candidate) => {
      const status = getImportCandidateStatus(candidate);
      summary.candidates.push(candidate);
      summary.totalCandidates += 1;

      if (status === "HIGH_CONFIDENCE") {
        summary.highConfidence += 1;
      } else if (status === "NEEDS_REVIEW") {
        summary.needsReview += 1;
      } else {
        summary.rejected += 1;
      }

      return summary;
    },
    {
      detectedFormat,
      totalCandidates: 0,
      highConfidence: 0,
      needsReview: 0,
      rejected: 0,
      candidates: [],
    },
  );
}

function buildGenericImportCandidates(text: string) {
  const normalizedText = normalizeQuestionnaireInput(text);
  const blocks = splitQuestionnaireBlocks(normalizedText);
  const context = {
    answerKey: extractAnswerKeyMap(normalizedText),
    blocks,
    normalizedText,
  };
  const candidates: ImportCandidate[] = [];

  for (const block of blocks) {
    if (answerKeyParser.canParse(block, context)) {
      continue;
    }

    const parser = parsers.find((current) => current.canParse(block, context));
    const detectedFormats = detectBlockFormats(block);

    if (parser) {
      const parsed = parser.parse(block, context)
        .map((candidate) => hydrateImportCandidate(candidate))
        .map((candidate) => ({
          ...candidate,
          warnings: uniqueWarnings(
            detectedFormats.includes("html-copy") && candidate.parserName !== "html-copy"
              ? [...candidate.warnings, "Bloco com ruido tipico de conteudo copiado de pagina."]
              : candidate.warnings,
          ),
        }));

      candidates.push(...parsed);
      continue;
    }

    if (
      looksLikeQuestionLine(block.rawBlock)
      || /^\[[^\]]+\]$/.test(block.lines[0] ?? "")
      || normalizeTypeHeader(block.lines[0] ?? "") === "GABARITO"
    ) {
      candidates.push(createUnknownCandidate(block.index, block.rawBlock, block.sectionTitle));
    }
  }

  return candidates;
}

export function buildImportReport(text: string): ImportReport {
  const vestibular = parseVestibularQuestionnaire(text);
  const candidates =
    vestibular.detected
      ? vestibular.candidates.map((candidate) => hydrateImportCandidate(candidate))
      : buildGenericImportCandidates(text);
  const report = summarizeReport(
    candidates,
    vestibular.detected ? "NUMBERED_QUESTIONNAIRE_WITH_FINAL_ANSWER_KEY" : "GENERIC",
  );

  if (process.env.NODE_ENV !== "production") {
    console.info("[questionnaire-import] format:", report.detectedFormat);
    console.info("[questionnaire-import] candidates:", report.totalCandidates);
    console.info("[questionnaire-import] high confidence:", report.highConfidence);
    console.info("[questionnaire-import] needs review:", report.needsReview);
    console.info("[questionnaire-import] rejected:", report.rejected);
    console.info("[questionnaire-import] warnings:", report.candidates.flatMap((candidate) => candidate.warnings).length);

    for (const candidate of report.candidates) {
      console.info("[questionnaire-import] parser used:", candidate.parserName, candidate.detectedType);
    }
  }

  return report;
}
