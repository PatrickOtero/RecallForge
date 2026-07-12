import { cn } from "@/lib/utils";

export const importReviewStyles = {
  page: "space-y-5",
  summaryCard:
    "rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]",
  summaryHeader: "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
  eyebrow: "text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600",
  title: "mt-1 text-2xl font-semibold tracking-tight text-slate-900",
  description: "mt-2 max-w-2xl text-sm leading-6 text-slate-600",
  statGrid: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
  statCard: "rounded-2xl border border-white bg-white px-4 py-4",
  statLabel: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-400",
  statValue: "mt-2 text-2xl font-semibold text-slate-900",
  statHint: "mt-1 text-xs text-slate-500",
  filters: "flex flex-wrap gap-2",
  filterButton: ({ active }: { active: boolean }) =>
    cn(
      "rounded-full border px-4 py-2 text-sm font-medium transition",
      active
        ? "border-cyan-400 bg-cyan-50 text-cyan-700"
        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
    ),
  actions: "flex flex-wrap gap-3",
  primaryButton:
    "rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
  secondaryButton:
    "rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
  candidateList: "space-y-4",
  card: ({ highlighted }: { highlighted: boolean }) =>
    cn(
      "rounded-[1.75rem] border bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition",
      highlighted ? "border-amber-300 bg-amber-50/40" : "border-slate-200",
    ),
  cardHeader: "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
  cardMeta: "flex flex-wrap items-center gap-3",
  badgeStack: "flex flex-wrap items-center gap-2",
  checkboxRow: "flex items-center gap-2 text-sm font-medium text-slate-600",
  confidenceBadge: ({ status }: { status: "HIGH_CONFIDENCE" | "NEEDS_REVIEW" | "REJECTED" }) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
      status === "HIGH_CONFIDENCE"
        ? "bg-emerald-100 text-emerald-700"
        : status === "NEEDS_REVIEW"
          ? "bg-amber-100 text-amber-700"
          : "bg-rose-100 text-rose-700",
    ),
  reviewBadge: ({ status }: { status: "PENDING" | "CONFIRMED" | "REJECTED" }) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
      status === "CONFIRMED"
        ? "bg-emerald-100 text-emerald-700"
        : status === "PENDING"
          ? "bg-amber-100 text-amber-700"
          : "bg-rose-100 text-rose-700",
    ),
  parserBadge: "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500",
  rawBlock: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-500 whitespace-pre-wrap",
  editorGrid: "grid gap-4 lg:grid-cols-2",
  field: "space-y-2",
  fieldLabel: "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500",
  input:
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100",
  textarea:
    "min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100",
  compactTextarea:
    "min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100",
  select:
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100",
  optionList: "space-y-3",
  optionRow: "grid gap-3 lg:grid-cols-[1fr_auto_auto]",
  pairRow: "grid gap-3 lg:grid-cols-[1fr_1fr_auto]",
  optionToggle: ({ active }: { active: boolean }) =>
    cn(
      "rounded-full border px-4 py-3 text-sm font-semibold transition",
      active
        ? "border-cyan-400 bg-cyan-50 text-cyan-700"
        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
    ),
  warningPanel: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4",
  warningTitle: "text-sm font-semibold text-amber-800",
  warningList: "mt-2 space-y-1 text-sm text-amber-700",
  helperText: "text-xs text-slate-500",
  emptyState: "rounded-[1.75rem] border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500",
  cardActions: "flex flex-wrap gap-3",
  footerActions: "mt-5 flex flex-wrap gap-3",
};
