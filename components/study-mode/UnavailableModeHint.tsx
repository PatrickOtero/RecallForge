import { unavailableModeHintStyles as styles } from "./UnavailableModeHint.styles";

interface UnavailableModeHintProps {
  message?: string;
}

export function UnavailableModeHint({ message }: UnavailableModeHintProps) {
  if (!message) {
    return null;
  }

  return <div className={styles.root}>{message}</div>;
}
