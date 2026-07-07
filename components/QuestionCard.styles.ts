import { cn } from "@/lib/utils";

interface FeedbackPanelState {
  isPositive: boolean;
  showImmediateFeedback: boolean;
}

export const questionCardStyles = {
  root: "rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] md:p-8",
  badges: "flex flex-wrap items-center gap-3",
  typeBadge: "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600",
  topicBadge: "rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700",
  header: "mt-6",
  eyebrow: "text-xs font-semibold uppercase tracking-[0.24em] text-slate-400",
  prompt: "mt-3 text-2xl font-semibold tracking-tight text-slate-900",
  body: "mt-8",
  feedbackPanel: ({ isPositive, showImmediateFeedback }: FeedbackPanelState) =>
    cn(
      "mt-8 rounded-[1.75rem] border px-5 py-4",
      showImmediateFeedback
        ? isPositive
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-slate-50",
    ),
  feedbackContent: "flex items-start gap-3",
  positiveIcon: "mt-0.5 h-5 w-5 text-emerald-600",
  reviewIcon: "mt-0.5 h-5 w-5 text-amber-600",
  pendingIcon: "mt-0.5 h-5 w-5 text-slate-500",
  feedbackText: "space-y-2 text-sm leading-6",
  feedbackTitle: "font-semibold text-slate-800",
  feedbackParagraph: "text-slate-600",
  feedbackLabel: "font-semibold text-slate-700",
};
