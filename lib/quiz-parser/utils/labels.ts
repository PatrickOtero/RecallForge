import { trimOuterPunctuation } from "@/lib/quiz-parser/utils/text";

export function stripQuestionnaireLabel(value: string) {
  return trimOuterPunctuation(
    value.replace(
      /^(?:p|r|q|a|pergunta|resposta|resposta esperada|gabarito|enunciado|quest[aã]o|instru[cç][aã]o)\s*(?::|\.|-)\s*/iu,
      "",
    ),
  );
}

export function stripListMarker(value: string) {
  return stripQuestionnaireLabel(
    value.replace(/^\s*(?:\d+[\).]|[A-Z][\).]|[-*•])\s*/iu, ""),
  );
}
