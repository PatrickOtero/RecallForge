import type { MatchingPair, QuestionDraft } from "@/lib/types";
import { normalizeForComparison } from "@/lib/utils";
import { stripQuestionnaireLabel } from "@/lib/quiz-parser/utils/labels";
import { buildStableId, cleanParserLine, ensureSentence, trimOuterPunctuation } from "@/lib/quiz-parser/utils/text";

const defaultPrompt = "Associe cada item à descrição correta.";
const matchingHeaderAliases = new Set([
  "ASSOCIACAO",
  "ASSOCIACAO DE ITENS",
  "MATCHING",
  "QUESTOES DE ASSOCIACAO",
]);
const matchingPairMatcher = /^\s*(?:(?:\d+|[A-Z])[\.\)]\s*)?(.+?)\s*(?:=>|->|→|⇨|—|–|\s-\s)\s*(.+?)\s*$/u;

function normalizeMatchingToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

function looksLikeMatchingPrompt(value: string) {
  const normalized = normalizeForComparison(stripQuestionnaireLabel(value));

  return (
    /^associe:?$/.test(normalized) ||
    /^relacione:?$/.test(normalized) ||
    /^associe cada item\b/.test(normalized) ||
    /^associe os itens da coluna a\b/.test(normalized) ||
    /^relacione as colunas\b/.test(normalized)
  );
}

function isMatchingHeader(line: string) {
  if (!/^\[.+\]$/.test(line)) {
    return false;
  }

  return matchingHeaderAliases.has(normalizeMatchingToken(line.replace(/^\[|\]$/g, "")));
}

function isMatchingInstruction(line: string) {
  return looksLikeMatchingPrompt(line);
}

function isAnyBracketHeader(line: string) {
  return /^\[[^\]]+\]$/.test(line);
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

function extractPrompt(lines: string[]) {
  for (const line of lines) {
    if (!line || isMatchingHeader(line) || isColumnLabel(line)) {
      continue;
    }

    const stripped = stripQuestionnaireLabel(line);
    if (!stripped) {
      continue;
    }

    if (looksLikeMatchingPrompt(line) || /^instruc(?:ao|oes?)\b/.test(normalizeForComparison(line))) {
      return ensureSentence(stripped);
    }
  }

  return defaultPrompt;
}

function buildDraft(pairs: MatchingPair[], prompt: string, topic = "Associação"): QuestionDraft | null {
  if (pairs.length < 2) {
    return null;
  }

  return {
    type: "MATCHING",
    prompt,
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

    const match = line.match(matchingPairMatcher);
    if (!match) {
      continue;
    }

    rawPairs.push({
      left: stripQuestionnaireLabel(match[1] ?? ""),
      right: stripQuestionnaireLabel(match[2] ?? ""),
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

    const left = stripQuestionnaireLabel(line.replace(/^\s*\d+[\).]\s*/, ""));
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
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    if (isMatchingHeader(line)) {
      if (currentBlock && currentBlock.length > 0) {
        blocks.push(currentBlock);
      }

      currentBlock = [line];
      continue;
    }

    if (!currentBlock) {
      continue;
    }

    if (line && isAnyBracketHeader(line)) {
      blocks.push(currentBlock);
      currentBlock = null;
      continue;
    }

    currentBlock.push(line);
  }

  if (currentBlock && currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export function parseMatchingQuestionDrafts(text: string): QuestionDraft[] {
  const matchingQuestions = extractMatchingBlocks(text).flatMap((block) => {
    const prompt = extractPrompt(block);
    const drafts = [
      buildDraft(parseColumnPairs(block), prompt),
      buildDraft(parseInlinePairs(block), prompt),
      buildDraft(parseItemAnswerPairs(block), prompt),
    ].filter((draft): draft is QuestionDraft => Boolean(draft));

    return drafts.slice(0, 1);
  });

  console.info("[quiz-parser] matching blocks found:", matchingQuestions.length);

  return matchingQuestions;
}

export const matchingParserInternals = {
  isMatchingHeader,
  isMatchingInstruction,
  normalizeMatchingToken,
};
