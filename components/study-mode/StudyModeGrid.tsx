import { Brain, FileStack, Layers3, ScrollText, Wand2 } from "lucide-react";

import type { QuizMode, QuizModeOption } from "@/lib/types";
import { StudyModeCard } from "@/components/study-mode/StudyModeCard";
import { studyModeGridStyles as styles } from "./StudyModeGrid.styles";

interface StudyModeGridProps {
  isPending: boolean;
  options: QuizModeOption[];
  onStart: (mode: QuizMode) => void;
}

const icons = {
  QUICK_REVIEW: Layers3,
  DEEP_DIVE: Brain,
  EXAM: ScrollText,
  FEYNMAN: Wand2,
  FLASHCARDS: FileStack,
} as const;

export function StudyModeGrid({ isPending, options, onStart }: StudyModeGridProps) {
  return (
    <div className={styles.root}>
      {options.map((option) => (
        <StudyModeCard
          key={option.mode}
          icon={icons[option.mode]}
          isPending={isPending}
          option={option}
          onStart={(selected) => onStart(selected.mode)}
        />
      ))}
    </div>
  );
}
