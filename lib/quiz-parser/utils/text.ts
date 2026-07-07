import { normalizeForComparison } from "@/lib/utils";

export function cleanParserLine(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function trimOuterPunctuation(value: string) {
  return cleanParserLine(value)
    .replace(/^[\s,;:.!"'`()[\]{}<>-]+|[\s,;:.!"'`()[\]{}<>-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ensureSentence(value: string) {
  const cleaned = trimOuterPunctuation(value);
  if (!cleaned) {
    return cleaned;
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

export function buildStableId(prefix: string, index: number, value: string) {
  const slug =
    normalizeForComparison(value)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 48) || `${prefix}-${index}`;

  return `${prefix}-${index}-${slug}`;
}
