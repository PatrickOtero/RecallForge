import { cn } from "@/lib/utils";

export const studyModeCardStyles = {
  root: (available: boolean) =>
    cn(
      "rounded-lg border p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition",
      available ? "border-white/70 bg-white/80" : "border-slate-200 bg-slate-50/80 opacity-75",
    ),
  header: "flex items-start justify-between gap-4",
  iconWrapper:
    "flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white shadow-lg shadow-slate-900/15",
  icon: "h-5 w-5",
  statusBadge: (available: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-semibold",
      available ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
    ),
  content: "mt-5",
  title: "text-xl font-semibold tracking-tight text-slate-900",
  tagline: "mt-1 text-sm font-medium text-cyan-700",
  description: "mt-3 text-sm leading-6 text-slate-500",
  chips: "mt-5 flex flex-wrap gap-2",
  chip: "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600",
  unavailableHint: "mt-4",
  startButton:
    "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none",
  startIcon: "h-4 w-4",
};
