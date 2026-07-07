export const quizRunnerStyles = {
  root: "space-y-6",
  topBar: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
  generationNote: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800",
  exitButton:
    "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50",
  icon: "h-4 w-4",
  progressCard: "rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]",
  error: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700",
  submittingNotice: "flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white",
  spinner: "h-4 w-4 animate-spin",
  actions: "flex flex-col gap-3 sm:flex-row sm:justify-end",
  nextButton:
    "inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800",
  finishButton:
    "inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70",
};
