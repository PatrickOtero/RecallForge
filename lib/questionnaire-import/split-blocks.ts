import { isLikelySectionTitle } from "@/lib/normalization/text-normalizer";
import {
  buildSectionTitleFallback,
  cleanInlineText,
  isBlankLine,
  isTypedHeader,
  looksLikeOptionLine,
  looksLikeQuestionLine,
} from "@/lib/questionnaire-import/parser-helpers";
import type { TextBlock } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

function pushBlock(result: TextBlock[], lines: string[], sectionTitle: string) {
  const rawBlock = lines.map(cleanInlineText).filter(Boolean).join("\n").trim();
  if (!rawBlock) {
    return;
  }

  result.push({
    index: result.length,
    rawBlock,
    lines: rawBlock.split("\n").map(cleanInlineText).filter(Boolean),
    sectionTitle,
  });
}

export function splitQuestionnaireBlocks(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const blocks: TextBlock[] = [];
  let sectionTitle = "Questionario importado";
  let current: string[] = [];
  const numberedQuestionMatcher = /^\s*\d{1,4}\)\s*(?:\([^)]+\))?\s*\S/u;

  function canBecomeSectionTitle(line: string, nextLine?: string) {
    const normalized = normalizeForComparison(line);

    if (
      numberedQuestionMatcher.test(line)
      || looksLikeOptionLine(line)
      || looksLikeQuestionLine(line)
      || /^(?:verdadeiro ou falso|certo ou errado|associe|relacione|coluna a|coluna b|gabarito|respostas?|frente|verso|termo|definicao|definicao)\b/.test(
        normalized,
      )
      || /^(?:p|q|r|a)\s*[:.-]/iu.test(line)
    ) {
      return false;
    }

    return isLikelySectionTitle(line, nextLine);
  }

  function isMatchingContinuation(linesInBlock: string[]) {
    const normalized = normalizeForComparison(linesInBlock.join(" "));
    return /associe|relacione|coluna a|coluna b/.test(normalized);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const nextLine = lines[index + 1]?.trim();

    if (isBlankLine(line)) {
      if (!isMatchingContinuation(current)) {
        pushBlock(blocks, current, buildSectionTitleFallback(sectionTitle));
        current = [];
      }
      continue;
    }

    if (!isTypedHeader(line) && canBecomeSectionTitle(line, nextLine) && current.length === 0) {
      sectionTitle = line;
      continue;
    }

    if (isTypedHeader(line) && current.length > 0) {
      pushBlock(blocks, current, buildSectionTitleFallback(sectionTitle));
      current = [];
    }

    current.push(line);
  }

  pushBlock(blocks, current, buildSectionTitleFallback(sectionTitle));
  return blocks;
}
