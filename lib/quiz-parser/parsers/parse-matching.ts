import type { MatchingPair, QuestionDraft } from "@/lib/types";
import { normalizeForComparison } from "@/lib/utils";
import { stripListMarker, stripQuestionnaireLabel } from "@/lib/quiz-parser/utils/labels";
import { buildStableId, cleanParserLine, ensureSentence, trimOuterPunctuation } from "@/lib/quiz-parser/utils/text";

const defaultPrompt = "Associe cada item à descrição correta.";

function isMatchingHeader(line: string) {
  const normalized = normalizeForComparison(line.replace(/^\[|\]$/g, ""));

  return /^\[.+\]$/.test(line) && (
    normalized === "associacao" ||
    normalized === "matching" ||
    normalized === "associacao de itens" ||
    normalized === "questoes de associacao"
  );
}

function isMatchingInstruction(line: string) {
  const normalized = normalizeForComparison(line);

  return (
    /^associe:?$/.test(normalized) ||
    /^relacione:?$/.test(normalized) ||
    /^associe cada item\b/.test(normalized) ||
    /^associe os itens da coluna a\b/.test(normalized) ||
    /^relacione as colunas\b/.test(normalized)
  );
}

function isAnyBracketHeader(line: string) {
  return /^\[[^\]]+\]$/.test(line);
}

function isHardSectionBoundary(line: string) {
  const normalized = normalizeForComparison(line);

  return (
    (isAnyBracketHeader(line) && !isMatchingHeader(line)) ||
    /^(?:bloco|modulo|modulo|tema|capitulo|secao|aula)\s+\d+/i.test(normalized)
  );
}

function isColumnLabel(line: string) {
  return /^(?:coluna\s+[ab]|gabarito)\b/.test(normalizeForComparison(line));
}

function buildPairs(rawPairs: Array<{ left: string; right: string }>): MatchingPair[] {
  const seen = new Set<string>();
  const pairs: MatchingPair[] = [];

  for (const rawPair of rawPairs) {
    const left = trimOuterPunctuation(rawPair.left);
    const right = ensureSentence(rawPair.right);
    const signature = `${normalizeForComparison(left)}|${normalizeForComparison(right)}`;

    if (!left || !right || seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    pairs.push({
      id: buildStableId("match", pairs.length, signature),
      left,
      right,
    });
  }

  return pairs;
}

function buildDraft(pairs: MatchingPair[], topic = "Associação"): QuestionDraft | null {
  if (pairs.length < 2) {
    return null;
  }

  return {
    type: "MATCHING",
    prompt: defaultPrompt,
    topic,
    matchingPairs: pairs,
    explanation: pairs.map((pair) => `${pair.left}: ${pair.right}`).join(" "),
  };
}

function parseInlinePairs(lines: string[]) {
  const rawPairs: Array<{ left: string; right: string }> = [];

  for (const line of lines) {
    if (!line || isMatchingHeader(line) || isMatchingInstruction(line) || isColumnLabel(line)) {
      continue;
    }

    const cleaned = stripListMarker(line);
    const match = cleaned.match(/^(.{2,120}?)\s*(?:=>|->|—|–|\s-\s)\s*(.{2,500})$/u);
    if (!match) {
      continue;
    }

    rawPairs.push({
      left: stripQuestionnaireLabel(match[1]),
      right: stripQuestionnaireLabel(match[2]),
    });
  }

  return buildPairs(rawPairs);
}

function parseItemAnswerPairs(lines: string[]) {
  const rawPairs: Array<{ left: string; right: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^\s*\d+[\).]\s+/.test(line)) {
      continue;
    }

    const left = stripListMarker(line);
    const next = lines[index + 1] ?? "";
    const following = lines[index + 2] ?? "";
    const inlineAnswer = next.match(/^(?:resposta|gabarito|answer)\s*[:.-]\s*(.*)$/iu);

    if (!inlineAnswer) {
      continue;
    }

    const right = inlineAnswer[1]?.trim() || following;
    rawPairs.push({
      left,
      right: stripQuestionnaireLabel(right),
    });
  }

  return buildPairs(rawPairs);
}

function parseColumnPairs(lines: string[]) {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  const keys: Array<[string, string]> = [];
  let mode: "left" | "right" | "key" | null = null;

  for (const line of lines) {
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
    }
  }

  return buildPairs(
    keys.flatMap(([leftKey, rightKey]) => {
      const leftValue = left.get(leftKey);
      const rightValue = right.get(rightKey);

      return leftValue && rightValue ? [{ left: leftValue, right: rightValue }] : [];
    }),
  );
}

function extractMatchingBlocks(text: string) {
  const lines = text.split(/\r?\n/).map(cleanParserLine);
  const blocks: string[][] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isMatchingHeader(line) && !isMatchingInstruction(line)) {
      continue;
    }

    const block: string[] = [line];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];

      if (current && cursor > index + 1 && isHardSectionBoundary(current)) {
        break;
      }

      block.push(current);
    }

    blocks.push(block);
  }

  return blocks;
}

export function parseMatchingQuestionDrafts(text: string): QuestionDraft[] {
  return extractMatchingBlocks(text).flatMap((block) => {
    const drafts = [
      buildDraft(parseColumnPairs(block)),
      buildDraft(parseInlinePairs(block)),
      buildDraft(parseItemAnswerPairs(block)),
    ].filter((draft): draft is QuestionDraft => Boolean(draft));

    return drafts.slice(0, 1);
  });
}

export const matchingParserInternals = {
  isMatchingHeader,
  isMatchingInstruction,
};
