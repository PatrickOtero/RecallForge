import { normalizeForComparison } from "@/lib/utils";
import { isTypedHeader, looksLikeOptionLine } from "@/lib/questionnaire-import/parser-helpers";
import type { TextBlock } from "@/lib/questionnaire-import/types";

export function detectBlockFormats(block: TextBlock) {
  const tags = new Set<string>();
  const normalized = normalizeForComparison(block.rawBlock);

  if (block.lines.some((line) => isTypedHeader(line))) {
    tags.add("typed-header");
  }

  if (block.lines.some((line) => looksLikeOptionLine(line))) {
    tags.add("objective-options");
  }

  if (/^(?:p|q|pergunta|questao)\s*[:.-]/i.test(block.lines[0] ?? "")) {
    tags.add("direct-qa");
  }

  if (/frente\s*[:.-]|verso\s*[:.-]|termo\s*[:.-]|definicao\s*[:.-]/i.test(normalized)) {
    tags.add("flashcard");
  }

  if (/gabarito|respostas?/.test(normalized)) {
    tags.add("answer-key");
  }

  if (/mostrar resposta|ver gabarito|comentarios|questao anterior|proxima questao/.test(normalized)) {
    tags.add("html-copy");
  }

  if (/coluna a|coluna b|associe|relacione|=>|->|→|⇨|\|/.test(block.rawBlock)) {
    tags.add("matching");
  }

  if (/verdadeiro ou falso|certo ou errado|\(v\)|\(f\)/i.test(normalized)) {
    tags.add("true-false");
  }

  if (/_{3,}|\.{3,}/.test(block.rawBlock)) {
    tags.add("fill-blank");
  }

  return [...tags];
}
