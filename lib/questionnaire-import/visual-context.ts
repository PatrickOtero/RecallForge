import type { ImportCandidateContextBlock } from "@/lib/questionnaire-import/types";
import { normalizeForComparison } from "@/lib/utils";

const visualContextPatterns = [
  /\bobserve a figura\b/i,
  /\ba figura abaixo\b/i,
  /\ba ilustracao abaixo\b/i,
  /\ba ilustração abaixo\b/i,
  /\bconforme a tabela\b/i,
  /\bos dados apresentados na tabela\b/i,
  /\bo anuncio\b/i,
  /\bo anúncio\b/i,
  /\ba personagem\b/i,
  /\bas fotos\b/i,
  /\bobserve a tabela\b/i,
  /\bfigura acima\b/i,
  /\bfotografias\b/i,
  /\btabela\b/i,
];

export function detectVisualContextRequirement(lines: string[]) {
  const normalized = normalizeForComparison(lines.join(" "));
  const requiresVisualContext = visualContextPatterns.some((pattern) => pattern.test(normalized));

  return {
    requiresVisualContext,
    visualContextWarning: requiresVisualContext
      ? "Esta questao depende de figura ou tabela. Verifique se o contexto visual foi preservado."
      : undefined,
  };
}

function looksLikeTableLine(line: string) {
  if (/\b(?:tabela|satelite|satélite|altitude|funcao|função|orbital|area coberta|area|fonte)\b/i.test(normalizeForComparison(line))) {
    return true;
  }

  const digits = line.match(/\d/g)?.length ?? 0;
  const words = line.split(/\s+/).filter(Boolean).length;
  return digits >= 3 && words <= 8;
}

export function extractContextBlocks(lines: string[]): ImportCandidateContextBlock[] {
  const blocks: ImportCandidateContextBlock[] = [];
  const tableLines = lines.filter((line) => looksLikeTableLine(line));

  if (tableLines.length >= 3) {
    blocks.push({
      type: "TABLE_TEXT",
      content: tableLines.join("\n"),
    });
  }

  return blocks;
}
