import { cn } from "@/lib/utils";

interface OptionButtonState {
  active: boolean;
  disabled: boolean;
}

export const trueFalseQuestionStyles = {
  root: "space-y-4",
  options: "grid gap-3 sm:grid-cols-2",
  optionButton: ({ active, disabled }: OptionButtonState) =>
    cn(
      "rounded-3xl border px-4 py-4 text-left text-sm font-medium transition",
      active
        ? "border-cyan-400 bg-cyan-50 text-slate-900"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      disabled && "cursor-not-allowed opacity-80",
    ),
  submitButton:
    "rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
};
