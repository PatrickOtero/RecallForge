import { cn } from "@/lib/utils";

interface OptionButtonState {
  active: boolean;
  disabled: boolean;
}

export const multiSelectQuestionStyles = {
  root: "space-y-4",
  choices: "grid gap-3",
  choiceButton: ({ active, disabled }: OptionButtonState) =>
    cn(
      "rounded-3xl border px-4 py-4 text-left text-sm font-medium transition",
      active
        ? "border-amber-400 bg-amber-50 text-slate-900"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      disabled && "cursor-not-allowed opacity-80",
    ),
  choiceRow: "flex items-start gap-3",
  marker: ({ active }: { active: boolean }) =>
    cn(
      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold transition",
      active ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 bg-white text-transparent",
    ),
  helperText: "text-xs text-slate-500",
  feedback: ({ correct }: { correct: boolean }) =>
    cn("text-xs font-medium", correct ? "text-emerald-600" : "text-rose-600"),
  actions: "flex flex-wrap gap-3",
  submitButton:
    "rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
  clearButton:
    "rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
};
