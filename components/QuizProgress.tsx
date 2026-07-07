import { quizProgressStyles as styles } from "./QuizProgress.styles";

interface QuizProgressProps {
  current: number;
  total: number;
  label: string;
}

export function QuizProgress({ current, total, label }: QuizProgressProps) {
  const percentage = Math.max(0, Math.min(100, Math.round((current / total) * 100)));

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <p className={styles.title}>{label}</p>
        <p className={styles.counter}>
          Pergunta {current} de {total}
        </p>
      </div>
      <div className={styles.track}>
        <div className={styles.bar} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
