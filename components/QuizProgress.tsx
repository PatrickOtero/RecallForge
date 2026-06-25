import { cn } from "@/lib/utils";

interface QuizProgressProps {
  current: number;
  total: number;
  label: string;
}

export function QuizProgress({ current, total, label }: QuizProgressProps) {
  const percentage = Math.max(0, Math.min(100, Math.round((current / total) * 100)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-sm text-slate-500">
          Pergunta {current} de {total}
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200/70">
        <div
          className={cn(
            "h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#0891b2_55%,#67e8f9_100%)] transition-all duration-500",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
