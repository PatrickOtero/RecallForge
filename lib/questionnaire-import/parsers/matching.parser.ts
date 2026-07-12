import { clampConfidence } from "@/lib/questionnaire-import/confidence";
import {
  buildImportId,
  ensureSentence,
  normalizeTypeHeader,
  stripQuestionLabel,
  trimOuterPunctuation,
  uniqueWarnings,
} from "@/lib/questionnaire-import/parser-helpers";
import type { ImportCandidatePair, QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

const pairMatcher = /^\s*(?:(?:\d+|[A-Z])[\.\)]\s*)?(.+?)\s*(?:=>|->|→|⇨)\s*(.+?)\s*$/u;

function extractPrompt(block: TextBlock) {
  for (const line of block.lines) {
    if (/^(?:instruc(?:ao|oes?)|associe|relacione)\s*[:.-]?/iu.test(normalizeForComparison(line))) {
      return ensureSentence(stripQuestionLabel(line));
    }
  }

  return "Associe cada item à resposta correta.";
}

function parseArrowPairs(block: TextBlock) {
  const pairs: ImportCandidatePair[] = [];

  for (const line of block.lines) {
    const match = line.match(pairMatcher);
    if (!match) {
      continue;
    }

    pairs.push({
      left: trimOuterPunctuation(stripQuestionLabel(match[1] ?? "")),
      right: ensureSentence(stripQuestionLabel(match[2] ?? "")),
    });
  }

  return pairs.filter((pair) => pair.left && pair.right);
}

function parseTablePairs(block: TextBlock) {
  const rows = block.lines.filter((line) => line.includes("|"));
  if (rows.length < 3) {
    return [];
  }

  return rows
    .slice(1)
    .map((row) => row.split("|").map((cell) => trimOuterPunctuation(cell)))
    .filter((cells) => cells.length >= 2 && cells[0] && cells[1])
    .map(([left, right]) => ({
      left,
      right: ensureSentence(right),
    }));
}

function parseColumnPairs(block: TextBlock) {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  const keys: Array<[string, string]> = [];
  let mode: "left" | "right" | "key" | null = null;

  for (const line of block.lines) {
    const normalized = normalizeForComparison(line);

    if (/^coluna a\b/.test(normalized)) {
      mode = "left";
      continue;
    }

    if (/^coluna b\b/.test(normalized)) {
      mode = "right";
      continue;
    }

    if (/^gabarito\b/.test(normalized)) {
      mode = "key";
      for (const match of line.matchAll(/([A-Z])\s*[-–]\s*(\d+)/giu)) {
        keys.push([match[1].toUpperCase(), match[2]]);
      }
      continue;
    }

    if (mode === "left") {
      const match = line.match(/^([A-Z])[\).]\s+(.+)$/iu);
      if (match) {
        left.set(match[1].toUpperCase(), trimOuterPunctuation(match[2]));
      }
      continue;
    }

    if (mode === "right") {
      const match = line.match(/^(\d+)[\).]\s+(.+)$/iu);
      if (match) {
        right.set(match[1], ensureSentence(match[2]));
      }
      continue;
    }

    if (mode === "key") {
      for (const match of line.matchAll(/([A-Z])\s*[-–]\s*(\d+)/giu)) {
        keys.push([match[1].toUpperCase(), match[2]]);
      }
      continue;
    }

    const looseLeft = line.match(/^([A-Z])[\).]\s+(.+)$/iu);
    if (looseLeft) {
      left.set(looseLeft[1].toUpperCase(), trimOuterPunctuation(looseLeft[2]));
      continue;
    }

    const looseRight = line.match(/^(\d+)[\).]\s+(.+)$/iu);
    if (looseRight) {
      right.set(looseRight[1], ensureSentence(looseRight[2]));
    }
  }

  return keys
    .flatMap(([leftKey, rightKey]) => {
      const leftValue = left.get(leftKey);
      const rightValue = right.get(rightKey);
      return leftValue && rightValue ? [{ left: leftValue, right: rightValue }] : [];
    })
    .filter((pair) => pair.left && pair.right);
}

export function parseMatchingCandidate(
  block: TextBlock,
  parserName = "matching",
  baseConfidence = 0.88,
) {
  const warnings: string[] = [];
  const matchingPairs = parseColumnPairs(block);
  const arrowPairs = matchingPairs.length === 0 ? parseArrowPairs(block) : [];
  const tablePairs = matchingPairs.length === 0 && arrowPairs.length === 0 ? parseTablePairs(block) : [];
  const pairs = matchingPairs.length > 0 ? matchingPairs : arrowPairs.length > 0 ? arrowPairs : tablePairs;

  if (pairs.length === 0) {
    return null;
  }

  if (pairs.length < 2) {
    warnings.push("A associação foi detectada, mas o mapeamento ficou incompleto.");
  }

  const prompt = extractPrompt(block);
  const header = block.lines.find((line) => /^\[.+\]$/.test(line));
  const typeBoost = header && normalizeTypeHeader(header).includes("ASSOCIACAO") ? 0.07 : 0;
  const tablePenalty = tablePairs.length > 0 ? -0.08 : 0;

  return {
    id: buildImportId("matching", block.index, block.rawBlock),
    sourceIndex: block.index,
    rawBlock: block.rawBlock,
    parserName,
    detectedType: pairs.length >= 2 ? "MATCHING" : "UNKNOWN",
    confidence: clampConfidence((pairs.length >= 2 ? baseConfidence : 0.45) + typeBoost + tablePenalty),
    warnings: uniqueWarnings(warnings),
    question: prompt,
    matchingPairs: pairs,
    sectionTitle: block.sectionTitle,
  } as const;
}

export const matchingParser: QuestionnaireParser = {
  name: "matching",
  canParse(block: TextBlock) {
    const normalized = normalizeForComparison(block.rawBlock);
    return /associe|relacione|coluna a|coluna b|=>|->|→|⇨|\|/.test(normalized);
  },
  parse(block: TextBlock) {
    const candidate = parseMatchingCandidate(block);
    return candidate ? [candidate] : [];
  },
};
