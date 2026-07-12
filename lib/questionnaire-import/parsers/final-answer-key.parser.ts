import type { ContinuedDocumentLine } from "@/lib/questionnaire-import/page-continuation";
import { cleanInlineText, normalizeAnswerKeyReference } from "@/lib/questionnaire-import/parser-helpers";

export type FinalAnswerKeyEntry =
  | { type: "LETTER"; value: string }
  | { type: "BOOLEAN_SEQUENCE"; value: boolean[] }
  | { type: "DISCURSIVE"; value: string }
  | { type: "DISCURSIVE_PARTS"; parts: Array<{ label: string; answer: string }> };

export interface FinalAnswerKeyParseResult {
  entries: Map<string, FinalAnswerKeyEntry>;
  startIndex: number;
}

const answerKeyHeaderMatcher = /^gabarito$/iu;
const answerKeyEntryMatcher = /^(\d{1,4})\s*[-.)]\s*(.+)$/u;
const partMatcher = /^([a-z])[\).]\s*(.+)$/iu;

function parseBooleanSequence(value: string) {
  const parts = value
    .split(/[-/]/)
    .map((part) => cleanInlineText(part).toUpperCase())
    .filter(Boolean);

  if (parts.length < 2 || parts.some((part) => part !== "V" && part !== "F")) {
    return null;
  }

  return parts.map((part) => part === "V");
}

function parseDiscursiveParts(lines: string[]) {
  const parts: Array<{ label: string; answer: string }> = [];
  let current: { label: string; answerLines: string[] } | null = null;

  for (const line of lines) {
    const partMatch = line.match(partMatcher);
    if (partMatch) {
      if (current) {
        parts.push({
          label: current.label,
          answer: current.answerLines.join(" ").trim(),
        });
      }

      current = {
        label: partMatch[1].toLowerCase(),
        answerLines: [cleanInlineText(partMatch[2])],
      };
      continue;
    }

    if (current) {
      current.answerLines.push(cleanInlineText(line));
    }
  }

  if (current) {
    parts.push({
      label: current.label,
      answer: current.answerLines.join(" ").trim(),
    });
  }

  return parts;
}

function parseAnswerKeyEntry(lines: string[]): FinalAnswerKeyEntry {
  const firstLine = cleanInlineText(lines[0] ?? "");
  const allLines = lines.map((line) => cleanInlineText(line)).filter(Boolean);
  const letterMatch = firstLine.match(/^alternativa\s*[:.-]\s*([a-e])$/iu) ?? firstLine.match(/^([a-e])$/iu);

  if (letterMatch) {
    return {
      type: "LETTER",
      value: letterMatch[1].toUpperCase(),
    };
  }

  const booleanSequence = parseBooleanSequence(firstLine);
  if (booleanSequence) {
    return {
      type: "BOOLEAN_SEQUENCE",
      value: booleanSequence,
    };
  }

  const parts = parseDiscursiveParts(allLines);
  if (parts.length >= 2) {
    return {
      type: "DISCURSIVE_PARTS",
      parts,
    };
  }

  return {
    type: "DISCURSIVE",
    value: allLines.join(" ").trim(),
  };
}

export function parseFinalAnswerKey(lines: ContinuedDocumentLine[]): FinalAnswerKeyParseResult {
  const startIndex = lines.findIndex((line) => answerKeyHeaderMatcher.test(line.text));
  const entries = new Map<string, FinalAnswerKeyEntry>();

  if (startIndex === -1) {
    return {
      entries,
      startIndex,
    };
  }

  let currentNumber: string | null = null;
  let currentLines: string[] = [];

  function flushCurrent() {
    if (!currentNumber || currentLines.length === 0) {
      return;
    }

    entries.set(normalizeAnswerKeyReference(currentNumber), parseAnswerKeyEntry(currentLines));
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = cleanInlineText(lines[index]?.text ?? "");
    if (!line) {
      continue;
    }

    const entryMatch = line.match(answerKeyEntryMatcher);
    if (entryMatch) {
      flushCurrent();
      currentNumber = entryMatch[1];
      currentLines = [entryMatch[2]];
      continue;
    }

    if (currentNumber) {
      currentLines.push(line);
    }
  }

  flushCurrent();

  return {
    entries,
    startIndex,
  };
}
