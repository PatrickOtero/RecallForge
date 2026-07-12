import { cleanExtractedText } from "@/lib/normalization/text-normalizer";
import { normalizeForComparison } from "@/lib/utils";

const isolatedNoiseMatchers = [
  /^proxima questao$/i,
  /^questao anterior$/i,
  /^mostrar resposta$/i,
  /^ver (?:solucao|gabarito|resposta)$/i,
  /^compartilhar$/i,
  /^publicidade$/i,
  /^comentarios?$/i,
  /^login$/i,
  /^cadastrar$/i,
  /^entrar$/i,
  /^(?:inicio|home)\s*>\s*.+$/i,
  /^(?:pagina|página)\s+\d+\s+de\s+\d+$/i,
];

export function normalizeQuestionnaireInput(rawText: string) {
  return cleanExtractedText(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) {
        return true;
      }

      const normalized = normalizeForComparison(line);
      return !isolatedNoiseMatchers.some((matcher) => matcher.test(normalized));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
