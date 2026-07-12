import { cleanInlineText, normalizeAnswerKeyReference } from "@/lib/questionnaire-import/parser-helpers";
import type { QuestionnaireParser, TextBlock } from "@/lib/questionnaire-import/types";

const answerKeyHeaderMatcher = /^(?:gabarito|respostas?)\s*[:.-]?/iu;

function normalizeAnswerValue(value: string) {
  const cleaned = cleanInlineText(value);
  const letterMatch = cleaned.match(/^alternativa\s*[:.-]\s*([a-e])$/iu) ?? cleaned.match(/^([a-e])$/iu);

  if (letterMatch) {
    return letterMatch[1].toUpperCase();
  }

  return cleaned;
}

export function extractAnswerKeyMap(text: string) {
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/).map(cleanInlineText);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!answerKeyHeaderMatcher.test(line)) {
      continue;
    }

    const inlineEntries = line.matchAll(/(\d+)\s*[-.)]?\s*(?:alternativa\s*[:.-]\s*)?([A-Z]|V(?:ERDADEIRO)?|F(?:ALSO)?|C(?:ERTO)?|E(?:RRADO)?)/giu);
    for (const entry of inlineEntries) {
      map.set(normalizeAnswerKeyReference(entry[1]), normalizeAnswerValue(entry[2]));
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];
      if (!current) {
        break;
      }

      const match = current.match(/^(\d+)\s*[-.)]?\s*(.+)$/u);
      if (!match) {
        break;
      }

      map.set(normalizeAnswerKeyReference(match[1]), normalizeAnswerValue(match[2]));
      index = cursor;
    }
  }

  return map;
}

export const answerKeyParser: QuestionnaireParser = {
  name: "answer-key",
  canParse(block: TextBlock) {
    return answerKeyHeaderMatcher.test(block.lines[0] ?? "");
  },
  parse() {
    return [];
  },
};
