import type { LucideIcon } from "lucide-react";
import { Play } from "lucide-react";

import type { QuizModeOption } from "@/lib/types";
import { formatQuestionCount, getQuestionPresentationLabel } from "@/lib/utils";
import { UnavailableModeHint } from "@/components/study-mode/UnavailableModeHint";
import { studyModeCardStyles as styles } from "./StudyModeCard.styles";

interface StudyModeCardProps {
  icon: LucideIcon;
  isPending: boolean;
  option: QuizModeOption;
  onStart: (option: QuizModeOption) => void;
}

export function StudyModeCard({ icon: Icon, isPending, option, onStart }: StudyModeCardProps) {
  const disabled = isPending || !option.available;

  return (
    <article className={styles.root(option.available)}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          <Icon className={styles.icon} />
        </div>

        <span className={styles.statusBadge(option.available)}>
          {option.available ? formatQuestionCount(option.questionCount) : "Indisponível"}
        </span>
      </div>

      <div className={styles.content}>
        <h3 className={styles.title}>{option.title}</h3>
        <p className={styles.tagline}>{option.tagline}</p>
        <p className={styles.description}>{option.description}</p>
      </div>

      <div className={styles.chips}>
        {option.questionTypes.map((item) => (
          <span key={`${option.mode}-${item}`} className={styles.chip}>
            {getQuestionPresentationLabel(item)}
          </span>
        ))}
      </div>

      {!option.available ? (
        <div className={styles.unavailableHint}>
          <UnavailableModeHint message={option.unavailableMessage} />
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onStart(option)}
        className={styles.startButton}
      >
        <Play className={styles.startIcon} />
        {isPending ? "Preparando..." : "Iniciar rodada"}
      </button>
    </article>
  );
}
