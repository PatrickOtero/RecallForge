import { normalizeForComparison } from "@/lib/utils";

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
  "eh",
  "em",
  "entre",
  "essa",
  "esse",
  "esta",
  "este",
  "isso",
  "mais",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pelo",
  "pelos",
  "pela",
  "pelas",
  "por",
  "pra",
  "que",
  "se",
  "sem",
  "ser",
  "sua",
  "suas",
  "seu",
  "seus",
  "tem",
  "uma",
  "um",
  "umas",
  "uns",
]);

const phraseCanonicalizers: Array<[RegExp, string]> = [
  [/\barea de vendas\b/g, "loja"],
  [/\bsalao de vendas\b/g, "loja"],
  [/\bcentro de distribuicao\b/g, "cd"],
  [/\bpra venda\b/g, "venda"],
];

const tokenCanonicalizers = new Map<string, string>([
  ["acompanhamento", "relatorio"],
  ["analise", "relatorio"],
  ["analises", "relatorio"],
  ["armazenagem", "estoque"],
  ["armazenamento", "estoque"],
  ["ausencia", "falta"],
  ["cliente", "cliente"],
  ["clientes", "cliente"],
  ["compra", "cliente"],
  ["compras", "cliente"],
  ["consumidor", "cliente"],
  ["consumidores", "cliente"],
  ["inventario", "estoque"],
  ["inventarios", "estoque"],
  ["indisponibilidade", "falta"],
  ["item", "produto"],
  ["itens", "produto"],
  ["lojas", "loja"],
  ["mercadoria", "produto"],
  ["mercadorias", "produto"],
  ["produto", "produto"],
  ["produtos", "produto"],
  ["relatorios", "relatorio"],
  ["venda", "cliente"],
  ["vendas", "cliente"],
]);

function singularize(token: string) {
  if (token.length <= 4) {
    return token;
  }

  if (token.endsWith("oes")) {
    return `${token.slice(0, -3)}ao`;
  }

  if (token.endsWith("aes")) {
    return `${token.slice(0, -3)}ao`;
  }

  if (token.endsWith("is")) {
    return `${token.slice(0, -2)}l`;
  }

  if (token.endsWith("ns")) {
    return `${token.slice(0, -2)}m`;
  }

  if (token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function canonicalizeToken(token: string) {
  const singular = singularize(token);
  return tokenCanonicalizers.get(token) ?? tokenCanonicalizers.get(singular) ?? singular;
}

export function normalizeQuizText(value: string) {
  return normalizeForComparison(value)
    .replace(/\s+/g, " ")
    .trim();
}

export function extractConceptTokens(value: string) {
  let normalized = normalizeQuizText(value);

  for (const [pattern, replacement] of phraseCanonicalizers) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .split(/\s+/)
    .map((token) => canonicalizeToken(token))
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

export function uniqueConceptTokens(value: string) {
  return [...new Set(extractConceptTokens(value))];
}

export function buildPromptSignature(prompt: string) {
  return normalizeQuizText(prompt);
}

export function conceptSimilarity(left: string, right: string) {
  const leftTokens = new Set(uniqueConceptTokens(left));
  const rightTokens = new Set(uniqueConceptTokens(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

export function extractReferenceKeywords(value: string, limit = 6) {
  const counts = new Map<string, number>();

  for (const token of extractConceptTokens(value)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] === left[1]) {
        return left[0].localeCompare(right[0]);
      }

      return right[1] - left[1];
    })
    .slice(0, limit)
    .map(([token]) => token);
}
