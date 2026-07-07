import { cn } from "@/lib/utils";

type FlashcardActionTone = "miss" | "almost" | "gotIt";

const actionToneStyles: Record<FlashcardActionTone, string> = {
  miss: "bg-rose-50 text-rose-700",
  almost: "bg-amber-50 text-amber-700",
  gotIt: "bg-emerald-50 text-emerald-700",
};

export const flashcardQuestionStyles = {
  root: "space-y-4",
  revealButton:
    "rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
  answerPanel: "space-y-3 rounded-[1.75rem] border border-cyan-100 bg-cyan-50/80 p-5",
  label: "text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700",
  answerText: "mt-3 text-sm leading-7 text-slate-700",
  referenceBlock: "border-t border-cyan-100 pt-3",
  referenceText: "mt-2 text-sm leading-7 text-slate-700",
  actions: "grid gap-3 sm:grid-cols-3",
  actionButton: (tone: FlashcardActionTone) =>
    cn(
      "flex items-center justify-center gap-2 rounded-3xl px-4 py-4 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
      actionToneStyles[tone],
    ),
  actionIcon: "h-4 w-4",
};
