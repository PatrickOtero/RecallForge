import { cleanInlineText } from "@/lib/questionnaire-import/parser-helpers";
import { normalizeForComparison } from "@/lib/utils";

export interface ContinuedDocumentLine {
  index: number;
  page: number | null;
  text: string;
}

const pageHeaderMatcher = /^(\d{1,3})\s*\|\s*projeto medicina\b/iu;
const promoMatcher = /^(?:gostaria de baixar|todas as listas|do projeto medicina|de uma vez\?|acesse|clique aqui)$/iu;
const promoUrlMatcher = /^(?:www\.)?projetomedicina\.com\.br\/(?:produtos|.+)$/iu;
const repeatedHeaderMatcher = /^projeto medicina\b.*www\.projetomedicina\.com\.br/iu;
const pageTitleMatcher = /^(?:exercicios com gabarito de geografia|astronomia)$/iu;

function isRemovableBoilerplate(line: string, seenQuestion: boolean) {
  const normalized = normalizeForComparison(line);

  if (!line) {
    return true;
  }

  if (pageHeaderMatcher.test(line) || repeatedHeaderMatcher.test(line)) {
    return true;
  }

  if (promoMatcher.test(line) || promoUrlMatcher.test(line)) {
    return true;
  }

  if (!seenQuestion && pageTitleMatcher.test(line)) {
    return true;
  }

  if (!seenQuestion && /^(?:exercicios com gabarito|geografia|astronomia)\b/.test(normalized)) {
    return true;
  }

  if (/^(?:pagina|página)\s+\d+(?:\s+de\s+\d+)?$/iu.test(line) || /^\d{1,3}$/.test(line)) {
    return true;
  }

  return false;
}

export function prepareContinuedDocumentLines(text: string) {
  const rawLines = text.split(/\r?\n/).map((line) => cleanInlineText(line));
  const prepared: ContinuedDocumentLine[] = [];
  let currentPage: number | null = null;
  let seenQuestion = false;

  for (const rawLine of rawLines) {
    if (!rawLine) {
      continue;
    }

    const pageMatch = rawLine.match(pageHeaderMatcher);
    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
      continue;
    }

    if (isRemovableBoilerplate(rawLine, seenQuestion)) {
      continue;
    }

    if (/^\d{1,4}\)\s*(?:\([^)]+\))?\s*\S/u.test(rawLine)) {
      seenQuestion = true;
    }

    prepared.push({
      index: prepared.length,
      page: currentPage,
      text: rawLine,
    });
  }

  return prepared;
}
