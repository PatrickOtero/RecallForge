import { StudyWorkspace } from "@/components/StudyWorkspace";
import { homePageStyles as styles } from "./page.styles";

export default function Home() {
  return (
    <div className={styles.root}>
      <div className={styles.backdrop} />
      <main className={styles.main}>
        <StudyWorkspace />
      </main>
    </div>
  );
}
