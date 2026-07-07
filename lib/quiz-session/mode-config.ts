import type { QuestionType, QuizComposition, QuizMode } from "@/lib/types";

export interface StudyModeConfig {
  mode: QuizMode;
  title: string;
  tagline: string;
  description: string;
  composition: QuizComposition;
  fallbackQuestionTypes: QuestionType[];
  unavailableMessage: string;
}

export const studyModeConfigs: StudyModeConfig[] = [
  {
    mode: "QUICK_REVIEW",
    title: "Revisão geral",
    tagline: "Objetiva, direta e variada",
    description:
      "Combina os tipos disponíveis no questionário: múltipla escolha, verdadeiro/falso, associação e revelar resposta.",
    composition: "AUTO",
    fallbackQuestionTypes: [],
    unavailableMessage: "Este questionário não possui tipos suficientes para montar uma revisão geral.",
  },
  {
    mode: "DEEP_DIVE",
    title: "Múltipla escolha",
    tagline: "Alternativas objetivas",
    description: "Usa questões com alternativas prontas ou perguntas convertíveis com distratores plausíveis.",
    composition: "MULTIPLE_CHOICE_ONLY",
    fallbackQuestionTypes: ["MULTIPLE_CHOICE"],
    unavailableMessage: "Não há questões suficientes para múltipla escolha.",
  },
  {
    mode: "EXAM",
    title: "Verdadeiro/Falso",
    tagline: "Correção objetiva",
    description: "Usa apenas afirmações marcadas como verdadeiro/falso ou certo/errado no arquivo.",
    composition: "AUTO",
    fallbackQuestionTypes: ["TRUE_FALSE"],
    unavailableMessage: "Este material não possui questões de verdadeiro/falso.",
  },
  {
    mode: "FLASHCARDS",
    title: "Associação",
    tagline: "Pares e correspondências",
    description: "Usa blocos de associação para relacionar itens às respostas corretas.",
    composition: "AUTO",
    fallbackQuestionTypes: ["MATCHING"],
    unavailableMessage: "Este material não possui blocos de associação.",
  },
  {
    mode: "FEYNMAN",
    title: "Revelar resposta",
    tagline: "Pergunta, resposta e autoavaliação",
    description: "Mostra a pergunta, revela o gabarito e permite marcar Errei, Quase ou Acertei.",
    composition: "DISCURSIVE_ONLY",
    fallbackQuestionTypes: ["REVEAL_ANSWER"],
    unavailableMessage: "Este questionário não possui perguntas com resposta reconhecível para revelar.",
  },
];

export function getStudyModeConfig(mode: QuizMode) {
  return studyModeConfigs.find((config) => config.mode === mode) ?? studyModeConfigs[0];
}

export function getUnavailableModeMessage(mode: QuizMode) {
  return getStudyModeConfig(mode).unavailableMessage;
}
