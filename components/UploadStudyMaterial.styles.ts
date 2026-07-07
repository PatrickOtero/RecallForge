import { cn } from "@/lib/utils";

interface ModeButtonState {
  active: boolean;
}

export const uploadStudyMaterialStyles = {
  form: "space-y-6",
  intro: "space-y-2",
  title: "text-xl font-semibold tracking-tight text-slate-900",
  description: "text-sm text-slate-600",
  modeButtons: "flex flex-wrap items-center gap-3",
  modeButton: ({ active }: ModeButtonState) =>
    cn(
      "rounded-full px-4 py-2 text-sm font-semibold transition",
      active
        ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20"
        : "bg-white/70 text-slate-600 hover:bg-white",
    ),
  metadataGrid: "grid gap-4 md:grid-cols-[1.2fr_0.8fr]",
  field: "space-y-2",
  fieldLabel: "text-sm font-semibold text-slate-700",
  titleInput:
    "w-full rounded-3xl border border-white/70 bg-white/80 px-5 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100",
  formatsCard: "rounded-3xl border border-white/70 bg-white/65 px-5 py-4 shadow-sm",
  formatsTitle: "text-sm font-semibold text-slate-700",
  formatsText: "mt-2 text-sm leading-6 text-slate-500",
  formatName: "font-semibold text-slate-700",
  textPanel:
    "rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-[0_25px_80px_rgba(15,23,42,0.08)]",
  textPanelHeader: "flex items-center justify-between gap-3 border-b border-slate-100 px-2 pb-3",
  textPanelIntro: "flex items-center gap-3",
  textIconWrapper: "flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700",
  textIcon: "h-5 w-5",
  textPanelTitle: "text-sm font-semibold text-slate-800",
  textPanelHint: "text-xs text-slate-500",
  wordCountBadge: "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600",
  manualTextarea:
    "mt-4 min-h-72 w-full resize-none rounded-[1.5rem] border border-slate-100 bg-white px-5 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100",
  fileDrop:
    "block cursor-pointer rounded-[2rem] border border-dashed border-cyan-200 bg-white/75 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] transition hover:border-cyan-400 hover:bg-white",
  hiddenInput: "hidden",
  fileDropContent: "flex flex-col items-center justify-center gap-4 py-10 text-center",
  uploadIconWrapper:
    "flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-slate-900 text-white shadow-lg shadow-slate-900/20",
  uploadIcon: "h-7 w-7",
  fileDetails: "space-y-2",
  fileName: "text-base font-semibold text-slate-800",
  fileHint: "text-sm text-slate-500",
  supportedBadge: "rounded-full bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-700",
  error: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700",
  footer: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
  footerNote: "text-sm text-slate-500",
  submitButton:
    "inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70",
};
