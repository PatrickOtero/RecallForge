import { StudyWorkspace } from "@/components/StudyWorkspace";
import { getRecentSessions } from "@/lib/home-data";

export default async function Home() {
  const recentSessions = await getRecentSessions();

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_28%)]" />
      <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <StudyWorkspace recentSessions={recentSessions} />
      </main>
    </div>
  );
}
