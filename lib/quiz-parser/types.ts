import type { QuestionDraft } from "@/lib/types";

export type ParsedQuestion = QuestionDraft;

export interface StudyBankCapabilities {
  total: number;
  multipleChoice: number;
  trueFalse: number;
  matching: number;
  revealAnswer: number;
}

export interface StudyBank {
  questions: ParsedQuestion[];
  capabilities: StudyBankCapabilities;
}
