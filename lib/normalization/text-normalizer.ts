export interface TextSection {
  title: string;
  index: number;
  lines: string[];
  content: string;
}

const mojibakeArtifactMatcher = /(?:Ãƒ.|Ã‚.|Ã¢[\u0080-\u00BF]{1,2}|ï¿½|Ã¯Â¿Â½)/gu;
const mojibakeRunMatcher = /(?:Ãƒ.|Ã‚.|Ã¢[\u0080-\u00BF]{1,2}|Ã¯Â¿Â½)+/gu;
const invisibleControlMatcher = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;
const brokenSymbolMatcher = /[âˆƒâ‰¡ï¿¾]/g;

function normalizeDashes(value: string) {
  return value.replace(/(?:ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|Ã¢â‚¬â€œ|Ã¢â‚¬â€|â€“|â€”)/g, "-");
}

function normalizeBullets(value: string) {
  return value
    .replace(/^[>\u2022\u25ba\u25cf\u25e6\u27a2\u00bb\u00b7\u2023\u2043\uf0d8\u00d8]+\s*/gmu, "")
    .replace(/[>\u2022\u25ba\u25cf\u25e6\u27a2\u00bb\u00b7\u2023\u2043\uf0d8]/gmu, " ");
}

function countMojibakeArtifacts(value: string) {
  return value.match(mojibakeArtifactMatcher)?.length ?? 0;
}

function repairMojibakeRun(value: string) {
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8").normalize("NFC");
    return repaired.includes("ï¿½") ? value : repaired;
  } catch {
    return value;
  }
}

function repairMojibake(value: string) {
  let current = value.normalize("NFC");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const currentArtifacts = countMojibakeArtifacts(current);
    if (currentArtifacts === 0) {
      break;
    }

    const repaired = current.replace(mojibakeRunMatcher, repairMojibakeRun);
    const repairedArtifacts = countMojibakeArtifacts(repaired);
    if (repairedArtifacts >= currentArtifacts) {
      break;
    }

    current = repaired;
  }

  return current;
}

function repairBrokenPortugueseWords(value: string) {
  return value
    .replace(/\bimport-ncia\b/gi, "import\u00e2ncia")
    .replace(/\bpar-metros\b/gi, "par\u00e2metros")
    .replace(/\bpar-metro\b/gi, "par\u00e2metro")
    .replace(/\binforma-los\b/gi, "inform\u00e1-los");
}

function fixBrokenWordWrapping(value: string) {
  return value
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/(\p{L})\n(?=\p{Ll})/gu, "$1 ")
    .replace(/(?<=\p{Ll})\n(\p{Ll})/gu, " $1");
}

export function cleanExtractedText(value: string) {
  const cleaned = fixBrokenWordWrapping(
    repairBrokenPortugueseWords(repairMojibake(normalizeBullets(normalizeDashes(value))))
      .replace(invisibleControlMatcher, "")
      .replace(brokenSymbolMatcher, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .normalize("NFC"),
  );

  return cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n \n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .normalize("NFC");
}

export function getMeaningfulLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeNumberedTitle(line: string) {
  return /^\d+(\.\d+)*\s*[-:]\s+\S+/.test(line) || /^\d+(\.\d+)*\s+\S+/.test(line);
}

function looksLikeUppercaseTitle(line: string) {
  if (line.length < 4 || line.length > 90 || /[.!?]$/.test(line)) {
    return false;
  }

  const letters = line.match(/\p{L}/gu) ?? [];
  if (letters.length < 4) {
    return false;
  }

  const uppercase = line.match(/\p{Lu}/gu) ?? [];
  return uppercase.length / letters.length >= 0.75;
}

function looksLikeShortSubtitle(line: string, nextLine: string | undefined) {
  if (line.length < 4 || line.length > 90 || /[.!?]$/.test(line)) {
    return false;
  }

  if (/^\S+\s+(todo|todos|toda|todas)\b/i.test(line)) {
    return false;
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 14) {
    return false;
  }

  const startsUppercase = /^(?:\p{Lu}|[0-9])/u.test(line);
  const nextLooksContent = Boolean(nextLine && nextLine.length >= line.length / 2);

  return startsUppercase && nextLooksContent;
}

export function isLikelySectionTitle(line: string, nextLine?: string) {
  return looksLikeNumberedTitle(line) || looksLikeUppercaseTitle(line) || looksLikeShortSubtitle(line, nextLine);
}

export function extractSections(value: string) {
  const lines = getMeaningfulLines(value);
  const sections: TextSection[] = [];
  let currentTitle = "Visao geral";
  let currentLines: string[] = [];
  let sectionIndex = 0;

  function pushSection() {
    if (currentLines.length === 0) {
      return;
    }

    sections.push({
      title: currentTitle,
      index: sectionIndex,
      lines: [...currentLines],
      content: currentLines.join("\n"),
    });

    sectionIndex += 1;
    currentLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    if (isLikelySectionTitle(line, nextLine)) {
      pushSection();
      currentTitle = line;
      continue;
    }

    currentLines.push(line);
  }

  pushSection();

  return sections.length > 0
    ? sections
    : [
        {
          title: "Visao geral",
          index: 0,
          lines,
          content: value,
        },
      ];
}

export function splitTextIntoChunks(value: string, maxLength = 700) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      const sentences = paragraph
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

      for (const sentence of sentences) {
        if (!current) {
          current = sentence;
          continue;
        }

        if (`${current} ${sentence}`.length <= maxLength) {
          current = `${current} ${sentence}`;
        } else {
          chunks.push(current);
          current = sentence;
        }
      }

      continue;
    }

    if (!current) {
      current = paragraph;
      continue;
    }

    if (`${current}\n\n${paragraph}`.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [value];
}
