export const matchingQuestionStyles = {
  root: "space-y-5",
  pairs: "grid gap-3",
  pairRow:
    "grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] md:items-center",
  pairLabel: "text-sm font-semibold leading-6 text-slate-800",
  controls: "space-y-2",
  select:
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-80",
  feedback: (isCorrect: boolean) =>
    isCorrect ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-rose-700",
  actions: "flex flex-wrap gap-3",
  submitButton:
    "rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
  clearButton:
    "rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
};
