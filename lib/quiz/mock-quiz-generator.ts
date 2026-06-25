import "server-only";

import type {
  Document,
  QuestionChoice,
  QuestionDraft,
  QuizMode,
  QuizModeOption,
} from "@/lib/types";
import {
  extractSections,
  type TextSection,
} from "@/lib/normalization/text-normalizer";
import { normalizeForComparison, titleCase } from "@/lib/utils";
import type { GeneratedQuiz, QuizGenerator } from "@/lib/quiz/generator-interface";

type UnitCategory =
  | "definition"
  | "purpose"
  | "formula"
  | "comparison"
  | "procedure"
  | "risk"
  | "fact";

interface KnowledgeUnit {
  id: string;
  category: UnitCategory;
  subject: string;
  answer: string;
  statement: string;
  topic: string;
  sectionTitle: string;
  sectionIndex: number;
  importance: number;
  relatedTerms: string[];
  listItems?: string[];
  sourceExcerpt: string;
}

interface DocumentAnalysis {
  emphasis: string[];
  sections: TextSection[];
  units: KnowledgeUnit[];
}

interface ChoiceCandidate {
  label: string;
  unit: KnowledgeUnit;
}

interface GeneratedQuestionCandidate {
  question: QuestionDraft;
  unit: KnowledgeUnit;
  distractorUnits: KnowledgeUnit[];
}

interface QuestionQualityResult {
  valid: boolean;
  score: number;
  reasons: string[];
}

const targetQuestionCounts: Record<QuizMode, number> = {
  QUICK_REVIEW: 10,
  DEEP_DIVE: 15,
  EXAM: 20,
  FEYNMAN: 8,
  FLASHCARDS: 20,
};

const weakWords = new Set([
  "ajuda",
  "algum",
  "alguma",
  "area",
  "cliente",
  "coisa",
  "dados",
  "dias",
  "forma",
  "itens",
  "item",
  "local",
  "loja",
  "material",
  "muito",
  "parte",
  "ponto",
  "pontos",
  "processo",
  "processos",
  "produto",
  "produtos",
  "relacao",
  "rotina",
  "sistema",
  "tarefa",
  "quanto",
  "valor",
  "valores",
]);

const stopWords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "entre",
  "essa",
  "esse",
  "esta",
  "este",
  "isso",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "ser",
  "sua",
  "suas",
  "seu",
  "seus",
  "um",
  "uma",
  "umas",
  "uns",
]);

const purposeMatchers = [
  /\b(.{4,90}?)\s+serve para\s+(.{12,220})$/i,
  /\b(.{4,90}?)\s+permite\s+(.{12,220})$/i,
  /\b(.{4,90}?)\s+visa\s+(.{12,220})$/i,
  /\b(.{4,90}?)\s+(?:(?:e|é|eh)\s+)?utilizad[oa] para\s+(.{12,220})$/i,
  /\b(.{4,90}?)\s+ajuda a\s+(.{12,220})$/i,
];

const listTitleMatcher = /\b(procedimentos?|etapas?|passos?|cuidados?|motivos?|relatorios?|planejamento|recebimento|verificacao|inventario)\b/i;
const riskMatcher = /\b(risco|impacto|ruptura|afeta|afetam|consequentemente|gera|geram|leva|levam|resulta|resultam|cliente insatisfeito)\b/i;
const formulaMatcher = /\b(calculo|formula|equacao|percentual)\b/i;
const comparisonMatcher = /\b(diferenca entre|diferenciar|comparacao|comparado com|em comparacao com|versus)\b/i;
const acronymMatcher = /\b([A-Z]{2,5})\s*[:=-]\s*([^=]{4,160})$/;
const preferredPurposeSubjectMatcher = /\b(relatorio|ferramenta|sistema|planejamento|inventario|alocacao|roteiro|manual)\b/i;
const genericFormulaSubjectMatcher = /^(calculo|formula|equacao)$/i;
const definitionStylePromptMatcher = /^o que e\s+/i;
const contextDependencyMatcher =
  /\b(abaixo|acima|a seguir|na figura|na tabela|no quadro|na imagem|conforme figura|conforme tabela|como mostra|como mostrado|vide|neste exemplo)\b/i;
const brokenPromptMatcher = /^o que e\s+(toda|todo|este|esta|isso|abaixo|para isso)\b/i;
const sentenceLeadMatcher =
  /^(?:toda|todo|isso|isto|esta|este|estes|essas|esse|essa|aquele|aquela|aqueles|abaixo|para isso|um fator|uma forma|neste caso|nestes casos|nesse caso|nesses casos|quanto|muito)\b/i;
const trailingPrepositionMatcher = /\b(a|ao|aos|com|da|das|de|do|dos|em|entre|na|nas|no|nos|para|por|sem|sobre)\s*$/i;
const fragmentAnswerStartMatcher =
  /^(a|o|os|as|um|uma|uns|umas|de|da|do|dos|das|para|por|com|sem|entre|ao|aos|na|nas|no|nos)\b/i;
const directAnswerStartMatcher =
  /^(e|eh|sao|significa|consiste|corresponde|refere|serve|permite|visa|ajuda|mostra|explica)\b/i;
const inlineListDelimiterMatcher = /;\s*/;
const importanceMatcher = /\b(importante|importancia|essencial|fundamental|relevante)\b/i;
const impactMatcher = /\b(impacto|afeta|prejudica|reduz|aumenta|gera|leva|resulta)\b/i;
const concreteImpactMatcher =
  /\b(risco|ruptura|perda|perdas|insatisfacao|vencimento|prejudica|afeta diretamente|enfraquece|gera(?:ndo)? insatisfacao|leva a|resulta em)\b/i;
const truncatedAnswerEndingMatcher =
  /\b(a|ao|aos|as|com|da|das|de|do|dos|e|em|na|nas|no|nos|o|os|ou|para|por|que|se|sem|um|uma|uns|umas)\s*$/i;
const genericOperationalSubjectMatcher =
  /\b(setor|sistema|loja|produto|produtos|cliente|clientes)\b/i;

function trimPunctuation(value: string) {
  return value.replace(/^[\s,;:.\-–—"'`>•▪►]+|[\s,;:.\-–—"'`>•▪►]+$/g, "").trim();
}

function cleanTitle(title: string) {
  return trimPunctuation(title.replace(/^\d+(\.\d+)*\s*[-:]?\s*/, ""));
}

function cleanSubject(value: string) {
  return trimPunctuation(
    value
      .replace(/^(o|a|os|as)\s+/i, "")
      .replace(/\s+(e|sao|eh)$/i, ""),
  );
}

function cleanAnswer(value: string) {
  return trimPunctuation(value.replace(/\s+/g, " "));
}

function cleanSectionSubject(value: string) {
  return cleanTitle(value)
    .replace(/\s+-\s+(?:serve para|a ferramenta\s+(?:visa|permite)|define-se como|o relatorio reflete|para analisa[rs]|para analise|esta etiqueta|diariamente).*/i, "")
    .replace(/^importancia\s+d[aeo]s?\s+/i, "")
    .trim();
}

function extractWords(value: string) {
  return value.match(/[\p{L}]{4,}/gu) ?? [];
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function extractComparableTokens(value: string) {
  return normalizeForComparison(value)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function extractKeywords(value: string, limit = 24) {
  const counts = new Map<string, { label: string; count: number }>();

  for (const word of extractWords(value)) {
    const normalized = normalizeForComparison(word);
    if (normalized.length < 4 || stopWords.has(normalized)) {
      continue;
    }

    const entry = counts.get(normalized);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(normalized, { label: word, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1].count === left[1].count) {
        return left[0].localeCompare(right[0]);
      }

      return right[1].count - left[1].count;
    })
    .slice(0, limit)
    .map((entry) => entry[1].label);
}

function buildFrequencyMap(value: string) {
  const counts = new Map<string, number>();

  for (const word of extractWords(value)) {
    const normalized = normalizeForComparison(word);
    if (normalized.length < 4 || stopWords.has(normalized)) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return counts;
}

function buildTopic(sectionTitle: string, source: string) {
  const title = cleanTitle(sectionTitle);
  if (title && title !== "Visão geral") {
    return title;
  }

  const keywords = extractKeywords(source, 3);
  if (keywords.length === 0) {
    return "Ideia central";
  }

  return titleCase(keywords.join(" "));
}

function splitIntoSentences(section: TextSection) {
  return section.content
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 40)
    .map((text) => ({
      text,
      sectionTitle: section.title,
    }));
}

function hasSpecificWords(value: string) {
  const words = extractWords(value)
    .map((word) => normalizeForComparison(word))
    .filter((word) => !stopWords.has(word));

  if (words.length === 0) {
    return false;
  }

  return words.some((word) => !weakWords.has(word)) || words.length >= 2;
}

function hasConjugatedVerb(value: string) {
  const normalized = normalizeForComparison(value);
  return normalized
    .split(/\s+/)
    .some((token) =>
      /^(e|eh|sao|foi|foram|ser|tem|tinha|tiveram|vai|vao|gera|geram|leva|levam|afeta|afetam|permite|permitem|serve|servem|mostra|mostram|explica|explicam|calcula|calcula-se|define|define-se|chama|chamamos|corresponde|refere|consiste|depende|dependem|pode|podem|deve|devem)$/i.test(
        token,
      ),
    );
}

function looksLikeParagraphContinuation(value: string) {
  const normalized = normalizeForComparison(value);
  return (
    sentenceLeadMatcher.test(normalized) ||
    contextDependencyMatcher.test(normalized) ||
    /\bque\b/i.test(normalized) ||
    /^(de|do|da|dos|das|para|por)\b/i.test(normalized)
  );
}

function looksLikeClause(value: string) {
  const normalized = normalizeForComparison(value);
  return /\b(e|eh|sao)\s+(um|uma|o|a|os|as)\b|\b(permite|ajuda|serve|gera|leva|afeta|pode|deve|vai)\b/i.test(
    normalized,
  );
}

function isUsefulSubject(value: string) {
  const subject = cleanSubject(value);
  const words = subject.split(/\s+/).filter(Boolean);

  if (subject.length < 4 || subject.length > 90 || words.length > 10) {
    return false;
  }

  if (/^(isso|isto|essa|esse|esta|este|ele|ela)\b/i.test(subject) || /[:;]/.test(subject)) {
    return false;
  }

  if (looksLikeClause(subject)) {
    return false;
  }

  return hasSpecificWords(subject);
}

function isValidConceptCandidate(value: string) {
  const subject = cleanSubject(value);
  const normalized = normalizeForComparison(subject);
  const words = subject.split(/\s+/).filter(Boolean);
  const blockedSubjects = new Set(["ideal", "impacto", "caso", "casos"]);

  if (subject.length < 4 || subject.length > 80 || words.length === 0 || words.length > 6) {
    return false;
  }

  if (words.length === 1 && subject === subject.toLowerCase()) {
    return false;
  }

  if (/[,:;]/.test(subject) || trailingPrepositionMatcher.test(subject)) {
    return false;
  }

  if (
    blockedSubjects.has(normalized) ||
    normalized.startsWith("prioridade ") ||
    normalized.includes("neste caso") ||
    normalized.includes("nestes casos") ||
    normalized.includes("nesse caso") ||
    normalized.includes("nesses casos")
  ) {
    return false;
  }

  if (looksLikeParagraphContinuation(subject) || hasConjugatedVerb(subject)) {
    return false;
  }

  if (!hasSpecificWords(subject)) {
    return false;
  }

  return !brokenPromptMatcher.test(`O que e ${normalized}`);
}

function isUsefulAnswer(value: string) {
  const answer = cleanAnswer(value);
  return answer.length >= 10 && answer.length <= 240 && !truncatedAnswerEndingMatcher.test(answer);
}

function isDefinitionAnswerComplete(value: string) {
  const answer = cleanAnswer(value);
  const normalized = normalizeForComparison(answer);

  if (answer.length < 30 || answer.length > 240 || countWords(answer) < 8) {
    return false;
  }

  if (contextDependencyMatcher.test(normalized)) {
    return false;
  }

  if (fragmentAnswerStartMatcher.test(normalized) && !directAnswerStartMatcher.test(normalized)) {
    return false;
  }

  return hasSpecificWords(answer);
}

function finalizeDefinitionAnswer(value: string) {
  const answer = cleanAnswer(value);
  const normalized = normalizeForComparison(answer);

  if (directAnswerStartMatcher.test(normalized)) {
    return answer;
  }

  if (fragmentAnswerStartMatcher.test(normalized)) {
    return `E ${answer.charAt(0).toLowerCase()}${answer.slice(1)}`;
  }

  return answer;
}

function isPreferredPurposeSubject(value: string) {
  return preferredPurposeSubjectMatcher.test(value);
}

function scoreImportance(
  category: UnitCategory,
  subject: string,
  answer: string,
  sectionTitle: string,
  frequencyMap: Map<string, number>,
) {
  let score =
    category === "formula"
      ? 9
      : category === "procedure"
        ? 8
        : category === "comparison"
          ? 8
          : category === "definition"
            ? 7
            : category === "purpose"
              ? 7
              : category === "risk"
                ? 7
                : 5;

  const normalizedSubject = normalizeForComparison(subject);
  score += Math.min(3, frequencyMap.get(normalizedSubject) ?? 0);

  if (normalizeForComparison(sectionTitle).includes(normalizedSubject)) {
    score += 2;
  }

  if (/^[A-Z]{2,5}$/.test(subject)) {
    score += 2;
  }

  if (/[=/%]/.test(answer)) {
    score += 2;
  }

  if (importanceMatcher.test(answer) || impactMatcher.test(answer) || /serve para|calculo|formula/i.test(answer)) {
    score += 2;
  }

  if (cleanTitle(sectionTitle) !== "Visao geral") {
    score += 1;
  }

  if (contextDependencyMatcher.test(answer)) {
    score -= 4;
  }

  return score;
}

function extractDefinitionPair(value: string) {
  const sentence = cleanAnswer(value);

  const directMatch = sentence.match(
    /^(.{3,80}?)\s+(?:e|é|eh|sao|são|significa|refere-se a|corresponde a|consiste em)\s+(.{12,220})$/i,
  );
  if (directMatch) {
    return {
      subject: directMatch[1],
      answer: finalizeDefinitionAnswer(directMatch[2]),
    };
  }

  const defineAsMatch = sentence.match(/^(.{3,80}?)\s+define-se como\s+(.{12,220})$/i);
  if (defineAsMatch) {
    return {
      subject: defineAsMatch[1],
      answer: finalizeDefinitionAnswer(defineAsMatch[2]),
    };
  }

  const namedMatch = sentence.match(/^chamamos de\s+(.{3,60}?)\s+(.{12,220})$/i);
  if (namedMatch) {
    return {
      subject: namedMatch[1],
      answer: finalizeDefinitionAnswer(namedMatch[2]),
    };
  }

  const definedMatch = sentence.match(/^define-se\s+(.{3,60}?)\s+como\s+(.{12,220})$/i);
  if (definedMatch) {
    return {
      subject: definedMatch[1],
      answer: finalizeDefinitionAnswer(definedMatch[2]),
    };
  }

  return null;
}

function createUnit(
  category: UnitCategory,
  subject: string,
  answer: string,
  statement: string,
  section: TextSection,
  frequencyMap: Map<string, number>,
  listItems?: string[],
) {
  const cleanSub = cleanSubject(subject);
  const cleanAns = cleanAnswer(answer);
  const cleanStatement = cleanAnswer(statement);

  if (!isUsefulSubject(cleanSub) || !isUsefulAnswer(cleanAns) || cleanStatement.length < 20) {
    return null;
  }

  const topic = buildTopic(section.title, `${cleanSub} ${cleanAns}`);
  const relatedTerms = extractKeywords(`${cleanSub} ${cleanAns} ${topic}`, 6);

  return {
    id: `${category}-${normalizeForComparison(cleanSub)}-${normalizeForComparison(cleanAns).slice(0, 48)}`,
    category,
    subject: cleanSub,
    answer: cleanAns,
    statement: cleanStatement,
    topic,
    sectionTitle: section.title,
    sectionIndex: section.index,
    importance: scoreImportance(category, cleanSub, cleanAns, section.title, frequencyMap),
    relatedTerms,
    listItems,
    sourceExcerpt: cleanStatement,
  } satisfies KnowledgeUnit;
}

function extractLeadSentence(section: TextSection) {
  const sentences = splitIntoSentences(section);
  return sentences[0]?.text ?? "";
}

function completeFragmentWithSection(fragment: string, section: TextSection) {
  const cleanFragment = cleanAnswer(fragment);
  if (!cleanFragment) {
    return cleanFragment;
  }

  const sectionLead = cleanAnswer(section.lines.join(" "));
  if (!sectionLead) {
    return cleanFragment;
  }

  if (!truncatedAnswerEndingMatcher.test(cleanFragment) && /[.!?]$/.test(cleanFragment)) {
    return cleanFragment;
  }

  const combined = cleanAnswer(`${cleanFragment} ${sectionLead}`);
  const completeMatch = combined.match(/^(.{12,220}?(?:[.!?;]|,\s))/u);
  const shortened = completeMatch?.[1] ?? combined.slice(0, 220);

  return cleanAnswer(shortened);
}

function splitStructuredTitle(title: string) {
  const clean = cleanTitle(title).replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return {
    subject: parts[0],
    descriptor: parts.slice(1).join(" - "),
  };
}

function shouldPreferSectionSubject(candidate: string, sectionTitle: string) {
  const cleanCandidate = cleanSubject(candidate);
  const sectionSubject = cleanSectionSubject(sectionTitle);

  if (!sectionSubject || normalizeForComparison(cleanCandidate) === normalizeForComparison(sectionSubject)) {
    return false;
  }

  const candidateTokens = extractComparableTokens(cleanCandidate);
  const sectionTokens = extractComparableTokens(sectionSubject);
  const overlap = candidateTokens.filter((token) => sectionTokens.includes(token)).length;

  return (
    cleanCandidate.split(/\s+/).length <= 3 &&
    (genericOperationalSubjectMatcher.test(cleanCandidate) || overlap === 0)
  );
}

function collectDefinitionUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    for (const sentence of splitIntoSentences(section)) {
      if (purposeMatchers.some((matcher) => matcher.test(sentence.text))) {
        continue;
      }

      const pair = extractDefinitionPair(sentence.text);
      if (!pair) {
        continue;
      }

      if (!isValidConceptCandidate(pair.subject) || !isDefinitionAnswerComplete(pair.answer)) {
        continue;
      }

      const unit = createUnit("definition", pair.subject, pair.answer, sentence.text, section, frequencyMap);
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function collectPurposeUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    for (const sentence of splitIntoSentences(section)) {
      const describedToolMatch = sentence.text.match(
        /^(.{3,60}?)\s+(?:e|é|eh)\s+uma?\s+(?:ferramenta|relatorio|sistema)[^.!?]*?\s+que\s+(permite|ajuda a|visa)\s+(.{12,220})$/i,
      );
      if (describedToolMatch && isValidConceptCandidate(describedToolMatch[1])) {
        const unit = createUnit("purpose", describedToolMatch[1], describedToolMatch[3], sentence.text, section, frequencyMap);
        if (unit) {
          units.push(unit);
          continue;
        }
      }

      for (const matcher of purposeMatchers) {
        const match = sentence.text.match(matcher);
        if (!match) {
          continue;
        }

        const subject = cleanSubject(match[1]);
        if (
          !isValidConceptCandidate(subject) ||
          (/\bajuda a\b/i.test(sentence.text) && subject.split(/\s+/).length < 2 && !isPreferredPurposeSubject(subject))
        ) {
          continue;
        }

        const unit = createUnit("purpose", subject, match[2], sentence.text, section, frequencyMap);
        if (unit) {
          units.push(unit);
        }

        break;
      }
    }
  }

  return units;
}

function collectFormulaUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    for (const rawLine of section.lines) {
      const line = rawLine.replace(/^[-*\u2022]\s+|^\d+[\.\)]\s+/u, "").trim();
      if (line.length < 8) {
        continue;
      }

      const acronymMatch = line.match(acronymMatcher);
      if (acronymMatch) {
        const unit = createUnit("formula", acronymMatch[1], acronymMatch[2], line, section, frequencyMap);
        if (unit) {
          units.push(unit);
          continue;
        }
      }

      const namedMatch = line.match(/(?:calculo|formula|equacao)\s+(?:da|do|de)\s+(.+?)(?::|$)/i);
      const equalIndex = line.indexOf("=");
      if (equalIndex > 0) {
        const left = cleanSubject(line.slice(0, equalIndex));
        const right = cleanAnswer(line.slice(equalIndex + 1));
        const leftSubject = cleanSubject(left.split(":").pop() ?? left);
        const subject =
          cleanSubject(namedMatch?.[1] ?? "") ||
          (genericFormulaSubjectMatcher.test(leftSubject) ? cleanTitle(section.title) : leftSubject) ||
          cleanTitle(section.title);
        const answer = line.includes("=") ? line : right;
        const unit = createUnit("formula", subject, answer, line, section, frequencyMap);
        if (unit) {
          units.push(unit);
        }

        continue;
      }

      const calculatedMatch = line.match(/^(.{4,90}?)\s+pode ser calculad[oa]/i);
      if (calculatedMatch || namedMatch) {
        const subject = cleanSubject(calculatedMatch?.[1] ?? namedMatch?.[1] ?? cleanTitle(section.title));
        const unit = createUnit("formula", subject, line, line, section, frequencyMap);
        if (unit) {
          units.push(unit);
        }

        continue;
      }

      const looksLikeStandaloneRatio =
        line.includes("/") &&
        countWords(line) <= 10 &&
        !/[,:;]/.test(line) &&
        !contextDependencyMatcher.test(line);
      if (!looksLikeStandaloneRatio) {
        continue;
      }

      const subject = cleanTitle(section.title);
      if (!subject || genericFormulaSubjectMatcher.test(normalizeForComparison(subject))) {
        continue;
      }

      const unit = createUnit("formula", subject, line, line, section, frequencyMap);
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function collectTitleBasedUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    const title = cleanTitle(section.title).replace(/\s+/g, " ").trim();
    if (!title || title === "Visão geral") {
      continue;
    }

    const purposeMatch = title.match(/^(.+?)\s+-\s+serve para\s+(.+)$/i);
    if (purposeMatch && !trailingPrepositionMatcher.test(purposeMatch[2]) && countWords(purposeMatch[2]) >= 4 && !/\b(o|a|os|as|um|uma|uns|umas)\s*$/i.test(purposeMatch[2])) {
      const unit = createUnit(
        "purpose",
        purposeMatch[1],
        purposeMatch[2],
        `${purposeMatch[1]} serve para ${purposeMatch[2]}.`,
        section,
        frequencyMap,
      );
      if (unit) {
        units.push(unit);
        continue;
      }
    }

    const toolMatch = title.match(/^(.+?)\s+-\s+a ferramenta\s+(?:visa|permite)\s+(.+)$/i);
    if (toolMatch && !trailingPrepositionMatcher.test(toolMatch[2]) && countWords(toolMatch[2]) >= 4) {
      const unit = createUnit(
        "purpose",
        toolMatch[1],
        toolMatch[2],
        `${toolMatch[1]} serve para ${toolMatch[2]}.`,
        section,
        frequencyMap,
      );
      if (unit) {
        units.push(unit);
        continue;
      }
    }

    const definitionMatch = title.match(/^(.+?)\s+-\s+define-se como[, ]+\s*(.+)$/i);
    if (definitionMatch && !trailingPrepositionMatcher.test(definitionMatch[2])) {
      const unit = createUnit(
        "definition",
        definitionMatch[1],
        definitionMatch[2],
        `${definitionMatch[1]} é ${definitionMatch[2]}.`,
        section,
        frequencyMap,
      );
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function collectStructuredTitleUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    const structuredTitle = splitStructuredTitle(section.title);
    if (!structuredTitle) {
      continue;
    }

    const subject = cleanSectionSubject(structuredTitle.subject);
    const descriptor = structuredTitle.descriptor;

    if (!subject) {
      continue;
    }

    if (
      /^serve para\s+/i.test(descriptor) ||
      /^permite\s+/i.test(descriptor) ||
      /^visa\s+/i.test(descriptor) ||
      /^para anali/i.test(descriptor)
    ) {
      const rawAnswer = descriptor
        .replace(/^serve para\s+/i, "")
        .replace(/^para\s+/i, "")
        .replace(/^(permite|visa)\s+/i, "");
      const answer = completeFragmentWithSection(rawAnswer, section);
      const unit = createUnit("purpose", subject, answer, `${subject} serve para ${answer}.`, section, frequencyMap);
      if (unit) {
        units.push(unit);
        continue;
      }
    }

    const toolMatch = descriptor.match(/^a ferramenta\s+(?:visa|permite)\s+(.+)$/i);
    if (toolMatch) {
      const answer = completeFragmentWithSection(toolMatch[1], section);
      const unit = createUnit("purpose", subject, answer, `${subject} serve para ${answer}.`, section, frequencyMap);
      if (unit) {
        units.push(unit);
        continue;
      }
    }

    const definitionMatch = descriptor.match(/^define-se como[, ]+\s*(.+)$/i);
    if (definitionMatch) {
      const answer = completeFragmentWithSection(definitionMatch[1], section);
      const unit = createUnit("definition", subject, answer, `${subject} Ã© ${answer}.`, section, frequencyMap);
      if (unit) {
        units.push(unit);
        continue;
      }
    }

    const reflectiveMatch = descriptor.match(
      /^(o relatorio reflete|diariamente a loja recebe|esta etiqueta vem colada|opcao no coletor de dados que permite)\s+(.+)$/i,
    );
    if (reflectiveMatch) {
      const answer = completeFragmentWithSection(`${reflectiveMatch[1]} ${reflectiveMatch[2]}`, section);
      const unit = createUnit("fact", subject, answer, `${subject}: ${answer}.`, section, frequencyMap);
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function collectSectionLeadUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    const subject = cleanSectionSubject(section.title);
    if (!subject || subject === "VisÃ£o geral" || splitStructuredTitle(section.title)) {
      continue;
    }

    const leadSentence = extractLeadSentence(section);
    if (!leadSentence || contextDependencyMatcher.test(leadSentence)) {
      continue;
    }

    const unit = createUnit("fact", subject, leadSentence, leadSentence, section, frequencyMap);
    if (unit) {
      units.push(unit);
    }
  }

  return units;
}

function extractListItems(section: TextSection) {
  const explicitItems = section.lines
    .filter((line) => /^[-*\u2022]\s+|^\d+[\.\)]\s+/u.test(line))
    .map((line) => line.replace(/^[-*\u2022]\s+|^\d+[\.\)]\s+/u, "").trim())
    .filter((line) => line.length >= 8);

  if (explicitItems.length >= 2) {
    return explicitItems;
  }

  if (!listTitleMatcher.test(section.title) || section.lines.length < 2) {
    return [];
  }

  const compactLines = section.lines
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 140 && !/[.!?]$/.test(line));

  return compactLines.length >= 2 ? compactLines : [];
}

function buildProcedurePrompt(title: string) {
  const clean = cleanTitle(title).replace(/^procedimentos?\s+básicos?\s+(?:no|na|de)\s+/i, "");
  const normalized = normalizeForComparison(clean);

  if (normalized.includes("recebimento junto a fornecedores externos")) {
    return "Quais cuidados devem ser observados no recebimento junto a fornecedores externos?";
  }

  if (normalized.includes("recebimento")) {
    return "O que envolve a operação de recebimento?";
  }

  if (normalized.includes("armazenagem") || normalized.includes("armazenamento")) {
    return "Quais cuidados devem ser observados na armazenagem?";
  }

  if (normalized.includes("planejamento")) {
    return "Quais etapas fazem parte do planejamento de inventário?";
  }

  if (normalized.includes("inventario")) {
    return "Por que os inventários são importantes?";
  }

  if (normalized.includes("perda")) {
    return "Quais são causas comuns de perdas não identificadas?";
  }

  if (normalized.includes("gondola")) {
    return "Como funciona a alocação de gôndola?";
  }

  if (normalized.includes("movimentacoes internas")) {
    return "Por que as movimentações internas são importantes?";
  }

  return `Quais cuidados devem ser observados em ${clean.toLowerCase()}?`;
}

function collectProcedureUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    const items = extractListItems(section);
    if (items.length < 2) {
      continue;
    }

    const subject = cleanTitle(section.title);
    const answer = items.join("; ");
    const statement = `${buildProcedurePrompt(section.title)} ${answer}`;
    const unit = createUnit("procedure", subject, answer, statement, section, frequencyMap, items);

    if (unit) {
      units.push(unit);
    }
  }

  return units;
}

function collectComparisonUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    for (const sentence of splitIntoSentences(section)) {
      const betweenMatch = sentence.text.match(
        /diferenca entre\s+(.+?)\s+e\s+(.+?)(?:\s+(?:esta|estao|fica|ficam|reside|mostra|indica|revela|explica|evidencia)|[.!?]|$)/i,
      );
      if (betweenMatch) {
        const subject = `${cleanSubject(betweenMatch[1])} e ${cleanSubject(betweenMatch[2])}`;
        const unit = createUnit("comparison", subject, sentence.text, sentence.text, section, frequencyMap);
        if (unit) {
          units.push(unit);
        }

        continue;
      }

      const differsMatch = sentence.text.match(
        /(.{4,90}?)\s+(?:difere|se diferencia)\s+de\s+(.{4,90}?)(?:\s+(?:porque|pois|quando)|[.!?]|$)/i,
      );
      if (differsMatch) {
        const subject = `${cleanSubject(differsMatch[1])} e ${cleanSubject(differsMatch[2])}`;
        const unit = createUnit("comparison", subject, sentence.text, sentence.text, section, frequencyMap);
        if (unit) {
          units.push(unit);
        }

        continue;
      }

      if (!comparisonMatcher.test(sentence.text) && !/\benquanto\b/i.test(sentence.text)) {
        continue;
      }

      if (!/\b(comparacao|comparado com|em comparacao com|enquanto)\b/i.test(sentence.text)) {
        continue;
      }

      const title = cleanTitle(section.title);
      const subject = title !== "Visao geral" ? title : buildTopic(section.title, sentence.text);
      const unit = createUnit("comparison", subject, sentence.text, sentence.text, section, frequencyMap);
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function collectRiskUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    for (const sentence of splitIntoSentences(section)) {
      if (!riskMatcher.test(sentence.text)) {
        continue;
      }

      if (
        comparisonMatcher.test(sentence.text) ||
        Boolean(extractDefinitionPair(sentence.text)) ||
        purposeMatchers.some((matcher) => matcher.test(sentence.text))
      ) {
        continue;
      }

      const riskMatch = sentence.text.match(/risco de\s+(.+?)(?:,|\.|;|$)/i);
      const impactMatch = sentence.text.match(/impacto de\s+(.+?)(?:,|\.|;|$)/i);
      const causeMatch = sentence.text.match(/^(.{4,90}?)\s+(gera|afeta|provoca|reduz|aumenta|leva|resulta)\b/i);
      const candidateSubject = cleanSubject(
        causeMatch?.[1] ??
          riskMatch?.[1] ??
          impactMatch?.[1] ??
          cleanTitle(section.title) ??
          buildTopic(section.title, sentence.text),
      );
      const subject = shouldPreferSectionSubject(candidateSubject, section.title)
        ? cleanSectionSubject(section.title)
        : candidateSubject;

      const unit = createUnit("risk", subject, sentence.text, sentence.text, section, frequencyMap);
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function extractFactSubject(sentence: string, sectionTitle: string) {
  const importanceMatch = sentence.match(/^(.{4,80}?)\s+(?:configura-se|e|é|eh|sao|são|representa|tem)\b/i);
  if (importanceMatch && isValidConceptCandidate(importanceMatch[1])) {
    return cleanSubject(importanceMatch[1]);
  }

  const impactOfMatch = sentence.match(/impacto de\s+(.+?)(?:,|\.|;|$)/i);
  if (impactOfMatch && isValidConceptCandidate(impactOfMatch[1])) {
    return cleanSubject(impactOfMatch[1]);
  }

  const title = cleanSectionSubject(sectionTitle);
  return title !== "Visao geral" ? title : "";
}

function collectFactUnits(sections: TextSection[], frequencyMap: Map<string, number>) {
  const units: KnowledgeUnit[] = [];

  for (const section of sections) {
    const sentences = splitIntoSentences(section).filter(
      (sentence) =>
        !listTitleMatcher.test(sentence.text) &&
        !contextDependencyMatcher.test(sentence.text) &&
        (importanceMatcher.test(sentence.text) || concreteImpactMatcher.test(sentence.text)),
    );

    for (const sentence of sentences) {
      const subject = extractFactSubject(sentence.text, section.title);
      if (!subject || !isValidConceptCandidate(subject)) {
        continue;
      }

      const unit = createUnit("fact", subject, sentence.text, sentence.text, section, frequencyMap);
      if (unit) {
        units.push(unit);
      }
    }
  }

  return units;
}

function dedupeUnits(units: KnowledgeUnit[]) {
  const seen = new Set<string>();
  const deduped: KnowledgeUnit[] = [];

  for (const unit of units) {
    const key = `${unit.category}|${normalizeForComparison(unit.subject)}|${normalizeForComparison(unit.answer)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(unit);
  }

  return deduped.sort((left, right) => right.importance - left.importance);
}

function analyzeDocument(document: Document): DocumentAnalysis {
  const sections = extractSections(document.cleanedText);
  const frequencyMap = buildFrequencyMap(document.cleanedText);

  const units = dedupeUnits([
    ...collectDefinitionUnits(sections, frequencyMap),
    ...collectPurposeUnits(sections, frequencyMap),
    ...collectFormulaUnits(sections, frequencyMap),
    ...collectTitleBasedUnits(sections, frequencyMap),
    ...collectStructuredTitleUnits(sections, frequencyMap),
    ...collectSectionLeadUnits(sections, frequencyMap),
    ...collectProcedureUnits(sections, frequencyMap),
    ...collectComparisonUnits(sections, frequencyMap),
    ...collectRiskUnits(sections, frequencyMap),
    ...collectFactUnits(sections, frequencyMap),
  ]);

  return {
    sections,
    units,
    emphasis: extractKeywords(document.cleanedText, 3),
  };
}

function buildSectionAwarePrompt(unit: KnowledgeUnit) {
  const subject = unit.subject.toLowerCase();
  const normalized = normalizeForComparison(unit.subject);

  if (normalized.includes("recebimento junto a fornecedores externos")) {
    return "Quais cuidados devem ser observados no recebimento junto a fornecedores externos?";
  }

  if (normalized.includes("recebimento")) {
    return "O que envolve a operação de recebimento?";
  }

  if (normalized.includes("armazenagem") || normalized.includes("armazenamento")) {
    return "Quais cuidados devem ser observados na armazenagem?";
  }

  if (normalized.includes("inventario")) {
    return "Por que os inventários são importantes?";
  }

  if (normalized.includes("perdas identificadas e nao identificadas")) {
    return "Qual é a diferença entre perdas identificadas e não identificadas?";
  }

  if (normalized.includes("relatorio de produtos com estoque sem vendas")) {
    return "Para que serve o relatório de produtos com estoque sem vendas?";
  }

  if (normalized.includes("pedido extra")) {
    return "Para que serve o pedido extra?";
  }

  if (importanceMatcher.test(unit.statement)) {
    return `Por que ${subject} é importante?`;
  }

  if (impactMatcher.test(unit.statement)) {
    return `Qual é o impacto de ${subject}?`;
  }

  return null;
}

function buildConcretePrompt(unit: KnowledgeUnit) {
  const subject = unit.subject.toLowerCase();
  const normalized = normalizeForComparison(unit.subject);
  const sectionContext = normalizeForComparison(cleanTitle(unit.sectionTitle));
  const context = `${sectionContext} ${normalized}`.trim();
  const normalizedStatement = normalizeForComparison(unit.statement);

  if (context.includes("sugestao de pedido automatico")) {
    return "Como funciona a sugestão de pedido automático?";
  }

  if (context.includes("saida media")) {
    return "O que é saída média?";
  }

  if (context.includes("cobertura de estoque")) {
    if (unit.category === "definition" || /\bindice utilizado\b/i.test(normalizeForComparison(unit.answer))) {
      return "O que é cobertura de estoque?";
    }

    if (concreteImpactMatcher.test(normalizedStatement)) {
      return "Quais riscos surgem quando a cobertura de estoque fica desequilibrada?";
    }

    return "Por que a cobertura de estoque merece atenção?";
  }

  if (context.includes("alocacao de gondola")) {
    return "Como funciona a alocação de gôndola?";
  }

  if (context.includes("estoque padrao")) {
    return "O que é estoque padrão?";
  }

  if (context.includes("faixas de reposicao de estoque")) {
    return "Como funcionam as faixas de reposição de estoque?";
  }

  if (context.includes("dias de estoque")) {
    return "O que são dias de estoque?";
  }

  if (normalized.includes("inventario")) {
    if (unit.category === "definition") {
      return "O que é inventário?";
    }

    return "Por que os inventários são importantes?";
  }

  if (context.includes("calculo das perdas")) {
    return "Como é calculada a perda bruta?";
  }

  if (normalized.includes("perdas identificadas e nao identificadas")) {
    return "Qual é a diferença entre perdas identificadas e não identificadas?";
  }

  if (normalized.includes("perda")) {
    if (unit.category === "definition") {
      return "O que é perda?";
    }

    if (concreteImpactMatcher.test(normalizedStatement)) {
      return "Quais são causas comuns de perdas não identificadas?";
    }
  }

  if (context.includes("relatorio de acompanhamento falta x excesso")) {
    return "O que o relatório de acompanhamento falta x excesso ajuda a identificar?";
  }

  if (context.includes("relatorio de produtos nao atendidos")) {
    return "O que o relatório de produtos não atendidos ajuda a verificar?";
  }

  if (context.includes("relatorio de produtos com estoque sem vendas")) {
    return "Para que serve o relatório de produtos com estoque sem vendas?";
  }

  if (context.includes("gestao de estoque cobertura")) {
    return "O que a gestão de estoque por cobertura permite analisar?";
  }

  if (context.includes("posicao de estoque")) {
    return "O que o relatório de posição de estoque mostra?";
  }

  if (context.includes("curva abc")) {
    return "Para que serve a curva ABC?";
  }

  if (context.includes("alerta estoque sem vendas")) {
    return "O que o alerta de estoque sem vendas por e-mail informa?";
  }

  if (context.includes("etiqueta de separacao")) {
    return "O que a etiqueta de separação indica no recebimento?";
  }

  if (context.includes("acompanhamento de perdas")) {
    return "O que o acompanhamento de perdas permite analisar?";
  }

  if (normalized.includes("pedido extra")) {
    return "Para que serve o pedido extra?";
  }

  if (importanceMatcher.test(unit.statement)) {
    return `Por que ${subject} é importante?`;
  }

  if (concreteImpactMatcher.test(normalizedStatement)) {
    return `Qual é o impacto de ${subject}?`;
  }

  return buildSectionAwarePrompt(unit);
}

function buildQuestionPrompt(unit: KnowledgeUnit) {
  if (unit.category === "definition") {
    return `O que é ${unit.subject}?`;
  }

  if (unit.category === "purpose") {
    return buildConcretePrompt(unit) ?? `Para que serve ${unit.subject}?`;
  }

  if (unit.category === "formula") {
    return /^[A-Z]{2,5}$/.test(unit.subject)
      ? `O que significa ${unit.subject}?`
      : `Como é calculado ${unit.subject}?`;
  }

  if (unit.category === "comparison") {
    return normalizeForComparison(unit.subject).includes(" e ")
      ? `Qual é a diferença entre ${unit.subject}?`
      : `Como este ponto pode ser comparado em ${unit.subject.toLowerCase()}?`;
  }

  if (unit.category === "procedure") {
    return buildProcedurePrompt(unit.subject);
  }

  if (unit.category === "risk") {
    return buildSectionAwarePrompt(unit) ?? `Qual é o risco ou impacto ligado a ${unit.subject}?`;
  }

  return buildSectionAwarePrompt(unit) ?? `O que o material destaca sobre ${unit.subject.toLowerCase()}?`;
}

function buildQuestionPromptV2(unit: KnowledgeUnit) {
  if (unit.category === "definition") {
    return `O que Ã© ${unit.subject}?`;
  }

  if (unit.category === "purpose") {
    return buildConcretePrompt(unit) ?? `Para que serve ${unit.subject}?`;
  }

  if (unit.category === "formula") {
    return /^[A-Z]{2,5}$/.test(unit.subject)
      ? `O que significa ${unit.subject}?`
      : `Como Ã© calculado ${unit.subject}?`;
  }

  if (unit.category === "comparison") {
    return normalizeForComparison(unit.subject).includes(" e ")
      ? `Qual Ã© a diferenÃ§a entre ${unit.subject}?`
      : `Como este ponto pode ser comparado em ${unit.subject.toLowerCase()}?`;
  }

  if (unit.category === "procedure") {
    return buildProcedurePrompt(unit.subject);
  }

  if (unit.category === "risk") {
    return buildConcretePrompt(unit) ?? `Quais riscos ou impactos estÃ£o ligados a ${unit.subject}?`;
  }

  return buildConcretePrompt(unit) ?? `O que o material explica sobre ${unit.subject.toLowerCase()}?`;
}

function buildReinforcementPrompt(unit: KnowledgeUnit) {
  const normalized = normalizeForComparison(unit.subject);
  const sectionContext = normalizeForComparison(cleanTitle(unit.sectionTitle));
  const context = `${sectionContext} ${normalized}`.trim();

  if (context.includes("relatorio")) {
    return `Que tipo de situaÃ§Ã£o ${unit.subject} ajuda a acompanhar?`;
  }

  if (normalized.includes("inventario")) {
    return "O que precisa ser confrontado em um inventÃ¡rio?";
  }

  if (normalized === "ruptura" || normalized.includes("ruptura")) {
    return "Em que momento acontece a ruptura?";
  }

  if (normalized === "perda") {
    return "Que tipo de ocorrÃªncia o material classifica como perda?";
  }

  if (normalized.includes("perdas identificadas")) {
    return "Como o material caracteriza as perdas identificadas?";
  }

  if (context.includes("sugestao de pedido automatico")) {
    return "Quem gera a sugestÃ£o de pedido automÃ¡tico?";
  }

  if (normalized.includes("pedido extra")) {
    return "Quando faz sentido recorrer ao pedido extra?";
  }

  if (context.includes("alocacao de gondola")) {
    return "O que a alocaÃ§Ã£o de gÃ´ndola define na prÃ¡tica?";
  }

  if (context.includes("cobertura de estoque")) {
    return "O que a cobertura de estoque ajuda a medir?";
  }

  if (context.includes("saida media")) {
    return "O que a saÃ­da mÃ©dia mostra sobre o produto?";
  }

  if (context.includes("recebimento")) {
    return "Que cuidado o material destaca no recebimento?";
  }

  return null;
}

function buildRetentionPrompt(unit: KnowledgeUnit) {
  const normalized = normalizeForComparison(unit.subject);
  const sectionContext = normalizeForComparison(cleanTitle(unit.sectionTitle));
  const context = `${sectionContext} ${normalized}`.trim();

  if (context.includes("relatorio")) {
    return `Quando vale consultar ${unit.subject}?`;
  }

  if (normalized.includes("inventario")) {
    return "O que o inventário compara na prática?";
  }

  if (normalized === "perda") {
    return "O que transforma uma compra em perda?";
  }

  if (normalized.includes("ruptura")) {
    return "Por que a ruptura prejudica as vendas?";
  }

  if (normalized.includes("pedido extra")) {
    return "Qual é o papel do pedido extra no abastecimento?";
  }

  if (context.includes("alocacao de gondola")) {
    return "Qual quantidade a alocação de gôndola estabelece?";
  }

  if (context.includes("sugestao de pedido automatico")) {
    return "Em que momento a sugestão de pedido automático é gerada?";
  }

  if (context.includes("cobertura de estoque")) {
    return "Que decisão a cobertura de estoque ajuda a orientar?";
  }

  if (unit.category === "purpose") {
    return `Em que situaÃ§Ã£o ${unit.subject} Ã© Ãºtil?`;
  }

  if (unit.category === "definition") {
    return `Como reconhecer ${unit.subject} na prÃ¡tica?`;
  }

  if (unit.category === "fact") {
    return `O que vale lembrar sobre ${unit.subject}?`;
  }

  if (unit.category === "risk") {
    return `Que problema ${unit.subject} ajuda a evitar?`;
  }

  return null;
}

function buildPracticalPrompt(unit: KnowledgeUnit) {
  const normalized = normalizeForComparison(unit.subject);
  const sectionContext = normalizeForComparison(cleanTitle(unit.sectionTitle));
  const context = `${sectionContext} ${normalized}`.trim();

  if (context.includes("relatorio")) {
    return `Que decisÃ£o ${unit.subject} ajuda a tomar?`;
  }

  if (normalized.includes("inventario")) {
    return "Como o inventÃ¡rio ajuda a conferir o estoque?";
  }

  if (normalized.includes("pedido extra")) {
    return "Como o pedido extra ajuda a ajustar o abastecimento?";
  }

  if (context.includes("alocacao de gondola")) {
    return "Como a alocaÃ§Ã£o de gÃ´ndola ajuda a organizar o estoque da loja?";
  }

  if (context.includes("cobertura de estoque")) {
    return "Como a cobertura de estoque apoia a decisÃ£o de compra?";
  }

  return null;
}

function buildFeynmanPrompt(unit: KnowledgeUnit) {
  if (unit.category === "comparison") {
    return `Explique com suas palavras a diferença entre ${unit.subject}.`;
  }

  if (unit.category === "formula") {
    return /^[A-Z]{2,5}$/.test(unit.subject)
      ? `Explique com suas palavras o que significa ${unit.subject}.`
      : `Explique com suas palavras como funciona o cálculo de ${unit.subject}.`;
  }

  if (unit.category === "procedure") {
    return `Explique com suas palavras como funciona ${unit.subject.toLowerCase()}.`;
  }

  if (unit.category === "risk") {
    return `Explique com suas palavras por que ${unit.subject.toLowerCase()} pode trazer problemas.`;
  }

  return `Explique com suas palavras ${unit.subject.toLowerCase()}.`;
}

function buildRubric(unit: KnowledgeUnit, limit = 4) {
  if (unit.listItems && unit.listItems.length > 0) {
    return `Inclua pelo menos ${Math.min(limit, unit.listItems.length)} pontos centrais: ${unit.listItems
      .slice(0, limit)
      .join(", ")}.`;
  }

  const keywords = extractKeywords(`${unit.subject} ${unit.answer}`, limit);
  if (keywords.length > 0) {
    return `Vale mencionar: ${keywords.join(", ")}.`;
  }

  return "Retome a ideia principal, um detalhe importante e a finalidade desse ponto.";
}

function scoreChoiceCandidate(unit: KnowledgeUnit, candidate: KnowledgeUnit) {
  const subjectOverlap = extractComparableTokens(unit.subject).filter((token) =>
    extractComparableTokens(candidate.subject).includes(token),
  ).length;
  const answerOverlap = extractComparableTokens(unit.answer).filter((token) =>
    extractComparableTokens(candidate.answer).includes(token),
  ).length;
  const sectionDistance = Math.abs(candidate.sectionIndex - unit.sectionIndex);
  const answerLengthGap = Math.abs(candidate.answer.length - unit.answer.length);

  return (
    (candidate.category === unit.category ? 6 : 0) +
    (candidate.sectionTitle === unit.sectionTitle ? 8 : 0) +
    (sectionDistance <= 1 ? 4 : sectionDistance === 2 ? 2 : 0) +
    Math.min(4, subjectOverlap * 2) +
    Math.min(3, answerOverlap) +
    (answerLengthGap <= 30 ? 3 : answerLengthGap <= 60 ? 1 : 0) +
    candidate.importance
  );
}

function isReasonableDistractor(value: string) {
  const answer = cleanAnswer(value);
  const normalized = normalizeForComparison(answer);
  return (
    answer.length >= 20 &&
    answer.length <= 160 &&
    !contextDependencyMatcher.test(normalized) &&
    !trailingPrepositionMatcher.test(answer) &&
    !inlineListDelimiterMatcher.test(answer)
  );
}

function buildChoicePool(unit: KnowledgeUnit, units: KnowledgeUnit[]) {
  return units
    .filter((candidate) => candidate.id !== unit.id)
    .filter((candidate) => isReasonableDistractor(candidate.answer))
    .sort((left, right) => {
      return scoreChoiceCandidate(unit, right) - scoreChoiceCandidate(unit, left);
    })
    .map((candidate) => ({
      label: candidate.answer,
      unit: candidate,
    }));
}

function buildChoices(unit: KnowledgeUnit, candidates: ChoiceCandidate[]) {
  const unique: Array<{ label: string; unit: KnowledgeUnit }> = [
    {
      label: unit.answer,
      unit,
    },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeForComparison(candidate.label);
    const exists = unique.some((item) => {
      const current = normalizeForComparison(item.label);
      return (
        current === normalized ||
        (current.length > 16 && normalized.includes(current)) ||
        (normalized.length > 16 && current.includes(normalized))
      );
    });

    if (!exists) {
      unique.push(candidate);
    }

    if (unique.length >= 4) {
      break;
    }
  }

  if (unique.length < 4) {
    return null;
  }

  const selected = unique.slice(0, 4);

  return {
    choices: selected.map(({ label }) => ({
      id: normalizeForComparison(label).replace(/\s+/g, "-").slice(0, 48),
      label,
    })) satisfies QuestionChoice[],
    distractorUnits: selected.slice(1).map((entry) => entry.unit),
  };
}

function createMultipleChoiceQuestion(unit: KnowledgeUnit, units: KnowledgeUnit[]) {
  if (unit.category === "procedure" && unit.answer.length > 120) {
    return null;
  }

  const choiceSet = buildChoices(unit, buildChoicePool(unit, units));
  if (!choiceSet) {
    return null;
  }

  return {
    question: {
      type: "MULTIPLE_CHOICE",
      prompt: buildQuestionPromptV2(unit),
      topic: unit.topic,
      choices: choiceSet.choices,
      correctAnswer: unit.answer,
      explanation: unit.statement,
    } satisfies QuestionDraft,
    unit,
    distractorUnits: choiceSet.distractorUnits,
  } satisfies GeneratedQuestionCandidate;
}

function replaceFirstInsensitive(source: string, search: string, replacement: string) {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.replace(new RegExp(escaped, "i"), replacement);
}

function createFillBlankQuestion(unit: KnowledgeUnit) {
  if (!["definition", "purpose", "formula"].includes(unit.category)) {
    return null;
  }

  if (unit.category !== "formula" && !/[.!?]$/.test(unit.statement)) {
    return null;
  }

  const candidates = [unit.subject, ...unit.relatedTerms]
    .filter((term) => term.length >= 5)
    .filter((term) => normalizeForComparison(unit.statement).includes(normalizeForComparison(term)))
    .sort((left, right) => right.length - left.length);

  const blankTerm = candidates.find((term) => !weakWords.has(normalizeForComparison(term)));
  if (!blankTerm) {
    return null;
  }

  const prompt = replaceFirstInsensitive(unit.statement, blankTerm, "_____");
  if (prompt === unit.statement || prompt.length < 30) {
    return null;
  }

  return {
    question: {
      type: "FILL_BLANK",
      prompt: `Complete a lacuna: "${prompt}"`,
      topic: unit.topic,
      correctAnswer: blankTerm,
      explanation: `A expressao que completa essa ideia e "${blankTerm}".`,
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createTrueFalseQuestion(unit: KnowledgeUnit, units: KnowledgeUnit[], index: number) {
  if (
    unit.category === "procedure" ||
    unit.statement.length > 220 ||
    /^[>\-•▪►]/.test(unit.statement) ||
    !/[.!?]$/.test(unit.statement)
  ) {
    return null;
  }

  const shouldBeTrue = index % 2 === 0;
  let statement = unit.statement;

  if (!shouldBeTrue) {
    const alternatives = units.filter(
      (candidate) =>
        candidate.id !== unit.id &&
        candidate.category === unit.category &&
        normalizeForComparison(candidate.answer) !== normalizeForComparison(unit.answer),
    );

    const alternative = [...alternatives].sort((left, right) => scoreChoiceCandidate(unit, right) - scoreChoiceCandidate(unit, left))[0];
    if (!alternative) {
      return null;
    }

    if (normalizeForComparison(statement).includes(normalizeForComparison(unit.answer))) {
      statement = replaceFirstInsensitive(statement, unit.answer, alternative.answer);
    } else if (normalizeForComparison(statement).includes(normalizeForComparison(unit.subject))) {
      statement = replaceFirstInsensitive(statement, unit.subject, alternative.subject);
    }

    if (normalizeForComparison(statement) === normalizeForComparison(unit.statement)) {
      return null;
    }
  }

  return {
    question: {
      type: "TRUE_FALSE",
      prompt: `Verdadeiro ou falso: ${statement}`,
      topic: unit.topic,
      correctAnswer: shouldBeTrue ? "true" : "false",
      explanation: shouldBeTrue
        ? "A afirmacao acompanha o material."
        : `No material, a formulacao correta aparece assim: ${unit.statement}`,
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createShortAnswerQuestion(unit: KnowledgeUnit, feynman = false) {
  return {
    question: {
      type: "SHORT_ANSWER",
      prompt: feynman ? buildFeynmanPrompt(unit) : buildQuestionPromptV2(unit),
      topic: unit.topic,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      rubric: buildRubric(unit, feynman ? 5 : 4),
      explanation: "A melhor resposta recupera as ideias principais sem depender de copia literal.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createShortAnswerVariation(unit: KnowledgeUnit) {
  const prompt = buildReinforcementPrompt(unit);
  if (!prompt || normalizeForComparison(prompt) === normalizeForComparison(buildQuestionPromptV2(unit))) {
    return null;
  }

  return {
    question: {
      type: "SHORT_ANSWER",
      prompt,
      topic: unit.topic,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      rubric: buildRubric(unit, 3),
      explanation: "Use o trecho de referÃªncia para checar se vocÃª recuperou o ponto central sem copiar tudo.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createShortAnswerRetentionVariation(unit: KnowledgeUnit) {
  const prompt = buildRetentionPrompt(unit);
  const existingPrompts = [buildQuestionPromptV2(unit), buildReinforcementPrompt(unit)].filter(
    (existing): existing is string => Boolean(existing),
  );
  if (!prompt || existingPrompts.some((existing) => normalizeForComparison(existing) === normalizeForComparison(prompt))) {
    return null;
  }

  return {
    question: {
      type: "SHORT_ANSWER",
      prompt,
      topic: unit.topic,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      rubric: buildRubric(unit, 3),
      explanation: "Retome o ponto central com suas palavras e use o trecho de referência para conferir os detalhes.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function toFeynmanPrompt(prompt: string) {
  const body = prompt.replace(/\?$/, "").trim();
  return `Explique com suas palavras ${body.charAt(0).toLowerCase()}${body.slice(1)}.`;
}

function createFeynmanVariationQuestion(unit: KnowledgeUnit) {
  const prompt = buildRetentionPrompt(unit) ?? buildReinforcementPrompt(unit);
  const primaryPrompt = buildFeynmanPrompt(unit);

  if (!prompt) {
    return null;
  }

  const feynmanPrompt = toFeynmanPrompt(prompt);
  if (normalizeForComparison(feynmanPrompt) === normalizeForComparison(primaryPrompt)) {
    return null;
  }

  return {
    question: {
      type: "SHORT_ANSWER",
      prompt: feynmanPrompt,
      topic: unit.topic,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      rubric: buildRubric(unit, 5),
      explanation: "A melhor resposta ensina a ideia com clareza e recupera os detalhes realmente importantes.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createShortAnswerPracticalVariation(unit: KnowledgeUnit) {
  const prompt = buildPracticalPrompt(unit);
  const existingPrompts = [
    buildQuestionPromptV2(unit),
    buildReinforcementPrompt(unit),
    buildRetentionPrompt(unit),
  ].filter((existing): existing is string => Boolean(existing));

  if (!prompt || existingPrompts.some((existing) => normalizeForComparison(existing) === normalizeForComparison(prompt))) {
    return null;
  }

  return {
    question: {
      type: "SHORT_ANSWER",
      prompt,
      topic: unit.topic,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      rubric: buildRubric(unit, 3),
      explanation: "Relacione a ideia com a rotina descrita no material e confira os detalhes no trecho de referência.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createFlashcardQuestion(unit: KnowledgeUnit) {
  return {
    question: {
      type: "FLASHCARD",
      prompt: buildQuestionPromptV2(unit),
      topic: unit.topic,
      correctAnswer: unit.answer,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      explanation: "Compare sua lembranca com o trecho de referencia antes de marcar como foi.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createFlashcardVariation(unit: KnowledgeUnit) {
  const prompt = buildReinforcementPrompt(unit);
  if (!prompt || normalizeForComparison(prompt) === normalizeForComparison(buildQuestionPromptV2(unit))) {
    return null;
  }

  return {
    question: {
      type: "FLASHCARD",
      prompt,
      topic: unit.topic,
      correctAnswer: unit.answer,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      explanation: "Compare sua lembranÃ§a com o trecho de referÃªncia antes de marcar como foi.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function createFlashcardRetentionVariation(unit: KnowledgeUnit) {
  const prompt = buildRetentionPrompt(unit);
  const existingPrompts = [buildQuestionPromptV2(unit), buildReinforcementPrompt(unit)].filter(
    (existing): existing is string => Boolean(existing),
  );
  if (!prompt || existingPrompts.some((existing) => normalizeForComparison(existing) === normalizeForComparison(prompt))) {
    return null;
  }

  return {
    question: {
      type: "FLASHCARD",
      prompt,
      topic: unit.topic,
      correctAnswer: unit.answer,
      referenceAnswer: unit.category === "formula" ? unit.statement : unit.answer,
      explanation: "Compare sua lembrança com o trecho de referência antes de marcar como foi.",
    } satisfies QuestionDraft,
    unit,
    distractorUnits: [],
  } satisfies GeneratedQuestionCandidate;
}

function areQuestionsTooSimilar(left: QuestionDraft, right: QuestionDraft) {
  const leftTokens = new Set(extractComparableTokens(left.prompt));
  const rightTokens = new Set(extractComparableTokens(right.prompt));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(1, Math.min(leftTokens.size, rightTokens.size));

  return shared / denominator >= 0.8;
}

function validateGeneratedQuestion(
  candidate: GeneratedQuestionCandidate,
  acceptedQuestions: QuestionDraft[],
): QuestionQualityResult {
  const { question, unit, distractorUnits } = candidate;
  const prompt = question.prompt.trim();
  const normalizedPrompt = normalizeForComparison(prompt);
  const normalizedSubject = normalizeForComparison(unit.subject);
  const answerReference = question.correctAnswer ?? question.referenceAnswer ?? unit.answer;
  const reasons: string[] = [];
  let score = unit.importance;

  if (prompt.length < 10 || brokenPromptMatcher.test(normalizedPrompt)) {
    reasons.push("enunciado-fraco");
  }

  if (contextDependencyMatcher.test(prompt) || contextDependencyMatcher.test(unit.sourceExcerpt)) {
    reasons.push("depende-de-contexto-ausente");
  }

  if (unit.sourceExcerpt.length < 24) {
    reasons.push("fonte-curta");
  }

  if (
    !["comparison", "procedure"].includes(unit.category) &&
    !/^[A-Z]{2,5}$/.test(unit.subject) &&
    (!isValidConceptCandidate(unit.subject) || weakWords.has(normalizedSubject))
  ) {
    reasons.push("assunto-fraco");
  }

  if (definitionStylePromptMatcher.test(normalizedPrompt)) {
    const concept = prompt.replace(/^O que é\s+/i, "").replace(/^O que e\s+/i, "").replace(/\?$/, "");
    if (!isValidConceptCandidate(concept)) {
      reasons.push("conceito-invalido");
    }

    if (!isDefinitionAnswerComplete(answerReference)) {
      reasons.push("resposta-fragmentada");
    } else {
      score += 5;
    }
  }

  if (/^para que serve\s+/i.test(normalizedPrompt)) {
    const subject = normalizedPrompt.replace(/^para que serve\s+/i, "").replace(/\?$/, "");
    if (!isValidConceptCandidate(subject)) {
      reasons.push("finalidade-sem-conceito");
    }
  }

  if (/^como e calculado\s+/i.test(normalizedPrompt)) {
    const subject = normalizedPrompt.replace(/^como e calculado\s+/i, "").replace(/\?$/, "");
    if (genericFormulaSubjectMatcher.test(subject) || !hasSpecificWords(subject)) {
      reasons.push("calculo-generico");
    }
  }

  if (/^qual e o risco ou impacto ligado a\s+/i.test(normalizedPrompt)) {
    const subject = normalizedPrompt.replace(/^qual e o risco ou impacto ligado a\s+/i, "").replace(/\?$/, "");
    if (!isValidConceptCandidate(subject) || !riskMatcher.test(unit.statement)) {
      reasons.push("risco-fraco");
    }
  }

  if (question.type === "MULTIPLE_CHOICE") {
    const choices = question.choices ?? [];
    const normalizedChoices = choices.map((choice) => normalizeForComparison(choice.label));
    const duplicates = new Set(normalizedChoices);

    if (choices.length < 4 || duplicates.size !== choices.length) {
      reasons.push("alternativas-invalidas");
    }

    if (!choices.some((choice) => normalizeForComparison(choice.label) === normalizeForComparison(question.correctAnswer ?? ""))) {
      reasons.push("resposta-correta-ausente");
    }

    if (distractorUnits.some((distractor) => Math.abs(distractor.sectionIndex - unit.sectionIndex) > 2)) {
      reasons.push("distratores-distantes");
    } else {
      score += 4;
    }
  }

  if (question.type === "TRUE_FALSE" && contextDependencyMatcher.test(question.prompt)) {
    reasons.push("afirmacao-fragmentada");
  }

  if (
    (question.type === "TRUE_FALSE" || question.type === "FILL_BLANK") &&
    unit.category !== "formula" &&
    !/[.!?]$/.test(unit.statement)
  ) {
    reasons.push("fonte-fragmentada");
  }

  if (unit.category === "formula" && genericFormulaSubjectMatcher.test(normalizedSubject)) {
    reasons.push("formula-sem-conceito");
  }

  if (
    unit.category === "formula" &&
    !normalizedPrompt.startsWith("o que significa") &&
    !normalizedPrompt.startsWith("complete a lacuna") &&
    !normalizedPrompt.startsWith("verdadeiro ou falso") &&
    !normalizedPrompt.startsWith("explique com suas palavras") &&
    !normalizedPrompt.startsWith("como e calculado")
  ) {
    reasons.push("formula-sem-template");
  }

  if (
    unit.category === "formula" &&
    !normalizedPrompt.startsWith("o que significa") &&
    !/^[A-ZÀ-Ý]/u.test(answerReference) &&
    !answerReference.includes("=")
  ) {
    reasons.push("formula-sem-expressao");
  }

  if (
    acceptedQuestions.some(
      (acceptedQuestion) =>
        (acceptedQuestion.type === question.type &&
          normalizeForComparison(acceptedQuestion.prompt) === normalizedPrompt) ||
        (acceptedQuestion.type === question.type && areQuestionsTooSimilar(acceptedQuestion, question)),
    )
  ) {
    reasons.push("pergunta-repetida");
  }

  if (importanceMatcher.test(unit.statement) || formulaMatcher.test(unit.statement) || /serve para/i.test(unit.statement)) {
    score += 3;
  }

  if (unit.sectionIndex <= 1) {
    score += 1;
  }

  return {
    valid: reasons.length === 0,
    score,
    reasons,
  };
}

function uniqueQuestions(questions: Array<GeneratedQuestionCandidate | null>, fallback: string) {
  const seen = new Set<string>();
  const result: QuestionDraft[] = [];

  const ranked = questions
    .filter((question): question is GeneratedQuestionCandidate => Boolean(question))
    .map((question) => ({
      candidate: question,
      quality: validateGeneratedQuestion(question, []).score,
      reasons: [] as string[],
    }));

  ranked.sort((left, right) => right.quality - left.quality);

  for (const entry of ranked) {
    const question = entry.candidate.question;
    const quality = validateGeneratedQuestion(entry.candidate, result);
    entry.quality = quality.score;
    entry.reasons = quality.reasons;

    if (!quality.valid) {
      continue;
    }

    const key = `${question.type}|${normalizeForComparison(question.prompt)}`;
    if (seen.has(key)) {
      continue;
    }

    if (question.prompt.length < 10) {
      continue;
    }

    seen.add(key);
    result.push(question);
  }

  if (result.length > 0) {
    return result;
  }

  return [
    {
      type: "SHORT_ANSWER",
      prompt: "Resuma a ideia principal do material em 2 ou 3 frases.",
      topic: "Resumo geral",
      referenceAnswer: fallback,
      rubric: "Mencione o tema central, um detalhe importante e a conclusao principal.",
      explanation: "A resposta ideal mostra que voce entendeu o panorama geral.",
    } satisfies QuestionDraft,
  ];
}

function mergeUniqueUnits(groups: KnowledgeUnit[][]) {
  const seen = new Set<string>();
  const merged: KnowledgeUnit[] = [];

  for (const group of groups) {
    for (const unit of group) {
      if (seen.has(unit.id)) {
        continue;
      }

      seen.add(unit.id);
      merged.push(unit);
    }
  }

  return merged;
}

function takeBalancedBySection(units: KnowledgeUnit[], limit: number) {
  const groups = new Map<number, KnowledgeUnit[]>();

  for (const unit of units) {
    const current = groups.get(unit.sectionIndex) ?? [];
    current.push(unit);
    groups.set(unit.sectionIndex, current);
  }

  const balanced: KnowledgeUnit[] = [];
  const sectionIndexes = [...groups.keys()].sort((left, right) => left - right);

  while (balanced.length < limit) {
    let added = false;

    for (const sectionIndex of sectionIndexes) {
      const group = groups.get(sectionIndex);
      const next = group?.shift();
      if (!next) {
        continue;
      }

      balanced.push(next);
      added = true;

      if (balanced.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }
  }

  return balanced;
}

function selectDefinitionUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units
    .filter((unit) => unit.category === "definition")
    .filter((unit) => isValidConceptCandidate(unit.subject))
    .sort((left, right) => {
      const preferredMatcher =
        /\b(cobertura de estoque|saida media|inventario|perda|ruptura|curva abc|pedido extra|alocacao de gondola|estoque padrao)\b/i;
      const leftScore =
        left.importance +
        (preferredMatcher.test(left.subject) ? 6 : 0) +
        (countWords(left.subject) >= 2 && countWords(left.subject) <= 4 ? 2 : 0) +
        (isDefinitionAnswerComplete(left.answer) ? 3 : 0);
      const rightScore =
        right.importance +
        (preferredMatcher.test(right.subject) ? 6 : 0) +
        (countWords(right.subject) >= 2 && countWords(right.subject) <= 4 ? 2 : 0) +
        (isDefinitionAnswerComplete(right.answer) ? 3 : 0);
      return rightScore - leftScore;
    })
    , limit,
  );
}

function selectFormulaUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units
    .filter((unit) => unit.category === "formula")
    .filter(
      (unit) =>
        !genericFormulaSubjectMatcher.test(normalizeForComparison(unit.subject)) &&
        !contextDependencyMatcher.test(unit.answer) &&
        (/^[A-Z]{2,5}$/.test(unit.subject) || unit.answer.includes("=") || (unit.answer.includes("/") && countWords(unit.answer) <= 8)),
    )
    .sort((left, right) => {
      const preferredMatcher = /\b(cobertura de estoque|estoque padrao|perda bruta|dias de estoque)\b/i;
      const leftScore =
        left.importance +
        (preferredMatcher.test(left.subject) ? 5 : 0) +
        (/^[A-ZÀ-Ý]/u.test(left.answer) ? 3 : 0) +
        (left.answer.includes("=") ? 4 : 0) +
        (countWords(left.answer) <= 8 ? 2 : 0);
      const rightScore =
        right.importance +
        (preferredMatcher.test(right.subject) ? 5 : 0) +
        (/^[A-ZÀ-Ý]/u.test(right.answer) ? 3 : 0) +
        (right.answer.includes("=") ? 4 : 0) +
        (countWords(right.answer) <= 8 ? 2 : 0);
      return rightScore - leftScore;
    })
    , limit,
  );
}

function selectPurposeUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units
    .filter((unit) => unit.category === "purpose")
    .sort((left, right) => {
      const preferredMatcher =
        /\b(relatorio|curva abc|pedido extra|cobertura|produtos nao atendidos|falta x excesso|estoque sem vendas)\b/i;
      const leftScore =
        left.importance +
        (preferredMatcher.test(left.subject) ? 5 : 0) +
        (isPreferredPurposeSubject(left.subject) ? 4 : 0) +
        (left.subject.split(/\s+/).length > 1 ? 1 : 0);
      const rightScore =
        right.importance +
        (preferredMatcher.test(right.subject) ? 5 : 0) +
        (isPreferredPurposeSubject(right.subject) ? 4 : 0) +
        (right.subject.split(/\s+/).length > 1 ? 1 : 0);
      return rightScore - leftScore;
    })
    , limit,
  );
}

function selectProcedureUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units.filter((unit) => unit.category === "procedure").sort((left, right) => right.importance - left.importance),
    limit,
  );
}

function selectComparisonUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units.filter((unit) => unit.category === "comparison").sort((left, right) => right.importance - left.importance),
    limit,
  );
}

function selectRiskUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units
      .filter((unit) => unit.category === "risk")
      .sort((left, right) => {
        const preferredMatcher = /\b(cobertura de estoque|perda|ruptura|inventario)\b/i;
        const leftScore = left.importance + (preferredMatcher.test(left.subject) ? 5 : 0);
        const rightScore = right.importance + (preferredMatcher.test(right.subject) ? 5 : 0);
        return rightScore - leftScore;
      }),
    limit,
  );
}

function selectFactUnits(units: KnowledgeUnit[], limit: number) {
  return takeBalancedBySection(
    units
      .filter((unit) => unit.category === "fact")
      .sort((left, right) => {
        const preferredMatcher =
          /\b(sugestao de pedido automatico|cobertura de estoque|saida media|estoque padrao|dias de estoque|posicao de estoque|alerta estoque sem vendas)\b/i;
        const leftScore = left.importance + (preferredMatcher.test(left.subject) ? 4 : 0);
        const rightScore = right.importance + (preferredMatcher.test(right.subject) ? 4 : 0);
        return rightScore - leftScore;
      }),
    limit,
  );
}

function getTargetQuestionCount(mode: QuizMode) {
  return targetQuestionCounts[mode];
}

function buildQuestionCandidates(analysis: DocumentAnalysis, mode: QuizMode) {
  const units = analysis.units;
  const questions: Array<GeneratedQuestionCandidate | null> = [];

  if (mode === "QUICK_REVIEW") {
    const quickUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 6),
      selectPurposeUnits(units, 4),
      selectFormulaUnits(units, 3),
      selectRiskUnits(units, 3),
      selectFactUnits(units, 4),
    ]);

    quickUnits.slice(0, 4).forEach((unit) => {
      questions.push(createMultipleChoiceQuestion(unit, units));
    });
    quickUnits.slice(0, 3).forEach((unit, index) => {
      questions.push(createTrueFalseQuestion(unit, units, index));
    });
    quickUnits.slice(0, 5).forEach((unit) => {
      questions.push(createFillBlankQuestion(unit));
    });
    quickUnits.slice(0, 12).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit));
    });
    quickUnits.slice(0, 6).forEach((unit) => {
      questions.push(createShortAnswerVariation(unit));
    });
  }

  if (mode === "DEEP_DIVE") {
    const deepChoiceUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 5),
      selectPurposeUnits(units, 4),
      selectFormulaUnits(units, 3),
      selectRiskUnits(units, 3),
    ]);
    const deepShortUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 6),
      selectPurposeUnits(units, 5),
      selectFormulaUnits(units, 3),
      selectProcedureUnits(units, 3),
      selectComparisonUnits(units, 3),
      selectRiskUnits(units, 4),
      selectFactUnits(units, 5),
    ]);

    deepChoiceUnits.slice(0, 5).forEach((unit) => {
      questions.push(createMultipleChoiceQuestion(unit, units));
    });

    deepShortUnits.slice(0, 18).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit));
    });
    deepShortUnits.slice(0, 10).forEach((unit) => {
      questions.push(createShortAnswerVariation(unit));
    });
  }

  if (mode === "EXAM") {
    const examUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 10),
      selectFormulaUnits(units, 5),
      selectPurposeUnits(units, 8),
      selectComparisonUnits(units, 5),
      selectProcedureUnits(units, 5),
      selectRiskUnits(units, 5),
      selectFactUnits(units, 10),
    ]);
    const examShortUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 8),
      selectFormulaUnits(units, 3),
      selectPurposeUnits(units, 6),
      selectProcedureUnits(units, 5),
      selectComparisonUnits(units, 4),
      selectRiskUnits(units, 5),
      selectFactUnits(units, 10),
    ]);

    examUnits.slice(0, 6).forEach((unit) => {
      questions.push(createMultipleChoiceQuestion(unit, units));
    });

    examUnits.slice(3, 7).forEach((unit, index) => {
      questions.push(createTrueFalseQuestion(unit, units, index));
    });

    examUnits.slice(1, 7).forEach((unit) => {
      questions.push(createFillBlankQuestion(unit));
    });

    examShortUnits.slice(0, 10).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit));
    });
    examUnits.slice(0, 14).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit));
    });
    examUnits.slice(0, 14).forEach((unit) => {
      questions.push(createShortAnswerVariation(unit));
    });
    examUnits.slice(0, 14).forEach((unit) => {
      questions.push(createShortAnswerRetentionVariation(unit));
    });
    examUnits.slice(0, 10).forEach((unit) => {
      questions.push(createShortAnswerPracticalVariation(unit));
    });
  }

  if (mode === "FEYNMAN") {
    const feynmanUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 4),
      selectPurposeUnits(units, 3),
      selectFormulaUnits(units, 2),
      selectProcedureUnits(units, 2),
      selectComparisonUnits(units, 2),
      selectRiskUnits(units, 3),
      selectFactUnits(units, 3),
    ]);

    feynmanUnits.slice(0, 8).forEach((unit) => {
      questions.push(createShortAnswerQuestion(unit, true));
    });
    feynmanUnits.slice(0, 8).forEach((unit) => {
      questions.push(createFeynmanVariationQuestion(unit));
    });
    feynmanUnits.slice(0, 6).forEach((unit) => {
      questions.push(createShortAnswerVariation(unit));
    });
    feynmanUnits.slice(0, 6).forEach((unit) => {
      questions.push(createShortAnswerRetentionVariation(unit));
    });
  }

  if (mode === "FLASHCARDS") {
    const flashcardUnits = mergeUniqueUnits([
      selectDefinitionUnits(units, 12),
      selectFormulaUnits(units, 5),
      selectPurposeUnits(units, 12),
      selectProcedureUnits(units, 5),
      selectComparisonUnits(units, 3),
      selectRiskUnits(units, 5),
      selectFactUnits(units, 14),
    ]);

    flashcardUnits.slice(0, 20).forEach((unit) => {
      questions.push(createFlashcardQuestion(unit));
    });
    flashcardUnits.slice(0, 20).forEach((unit) => {
      questions.push(createFlashcardVariation(unit));
    });
    flashcardUnits.slice(0, 20).forEach((unit) => {
      questions.push(createFlashcardRetentionVariation(unit));
    });
  }

  return questions;
}

function finalizeGeneratedQuestions(analysis: DocumentAnalysis, mode: QuizMode) {
  const fallback = analysis.sections[0]?.content ?? "";
  const questions = uniqueQuestions(buildQuestionCandidates(analysis, mode), fallback);
  const target = getTargetQuestionCount(mode);

  return {
    questions: questions.slice(0, target).map((question, index) => ({
      ...question,
      topic: question.topic || `Tópico ${index + 1}`,
      choices: question.choices?.slice(0, 4),
    })),
    generationNote:
      questions.length < target
        ? `Este material gerou ${questions.length} ${questions.length === 1 ? "pergunta útil" : "perguntas úteis"} neste modo. Preferimos reduzir a quantidade quando o texto não oferece conteúdo confiável suficiente.`
        : undefined,
  };
}

class MockQuizGenerator implements QuizGenerator {
  generateQuizOptions(document: Document): QuizModeOption[] {
    const analysis = analyzeDocument(document);
    const previews = {
      QUICK_REVIEW: finalizeGeneratedQuestions(analysis, "QUICK_REVIEW").questions,
      DEEP_DIVE: finalizeGeneratedQuestions(analysis, "DEEP_DIVE").questions,
      EXAM: finalizeGeneratedQuestions(analysis, "EXAM").questions,
      FEYNMAN: finalizeGeneratedQuestions(analysis, "FEYNMAN").questions,
      FLASHCARDS: finalizeGeneratedQuestions(analysis, "FLASHCARDS").questions,
    };

    return [
      {
        mode: "QUICK_REVIEW",
        title: "Revisão rápida",
        tagline: "Perguntas diretas para aquecer a memória",
        description: "Prioriza definições, finalidades e pontos centrais com resposta rápida.",
        questionCount: previews.QUICK_REVIEW.length,
        questionTypes: [...new Set(previews.QUICK_REVIEW.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
      {
        mode: "DEEP_DIVE",
        title: "Questionário profundo",
        tagline: "Mais contexto, mais compreensão",
        description: "Explora definições, cálculos, comparações, riscos e procedimentos com mais profundidade.",
        questionCount: previews.DEEP_DIVE.length,
        questionTypes: [...new Set(previews.DEEP_DIVE.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
      {
        mode: "EXAM",
        title: "Modo prova",
        tagline: "Concentração total até o fim",
        description: "Mistura formatos diferentes e guarda o resultado para o encerramento.",
        questionCount: previews.EXAM.length,
        questionTypes: [...new Set(previews.EXAM.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: false,
      },
      {
        mode: "FEYNMAN",
        title: "Modo Feynman",
        tagline: "Explique como se estivesse ensinando",
        description: "Foca em explicações claras, com referência de apoio depois da resposta.",
        questionCount: previews.FEYNMAN.length,
        questionTypes: [...new Set(previews.FEYNMAN.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
      {
        mode: "FLASHCARDS",
        title: "Flashcards",
        tagline: "Lembrar, comparar e marcar",
        description: "Transforma conceitos, fórmulas e finalidades em revisão de frente e verso.",
        questionCount: previews.FLASHCARDS.length,
        questionTypes: [...new Set(previews.FLASHCARDS.map((question) => question.type))],
        emphasis: analysis.emphasis,
        immediateFeedback: true,
      },
    ];
  }

  generateQuizFromDocument(document: Document, mode: QuizMode): GeneratedQuiz {
    const analysis = analyzeDocument(document);
    const generated = finalizeGeneratedQuestions(analysis, mode);

    const optionTitle =
      this.generateQuizOptions(document).find((option) => option.mode === mode)?.title ?? "Sessão de estudo";

    return {
      title: `${document.title} - ${optionTitle}`,
      mode,
      questions: generated.questions,
    };
  }
}

const generator = new MockQuizGenerator();

export function generateQuizOptions(document: Document) {
  return generator.generateQuizOptions(document);
}

export function generateQuizFromDocument(document: Document, mode: QuizMode) {
  return generator.generateQuizFromDocument(document, mode);
}

export function getMinimumQuestionTarget(mode: QuizMode) {
  return getTargetQuestionCount(mode);
}
