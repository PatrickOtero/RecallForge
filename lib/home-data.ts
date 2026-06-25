import "server-only";

import { prisma } from "@/lib/prisma";
import type { RecentSessionSummary } from "@/lib/types";
import { formatShortDate } from "@/lib/utils";

export async function getRecentSessions(): Promise<RecentSessionSummary[]> {
  const sessions = await prisma.quizSession.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 4,
    select: {
      id: true,
      mode: true,
      title: true,
      score: true,
      createdAt: true,
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    mode: session.mode,
    title: session.title,
    score: session.score,
    createdAt: session.createdAt.toISOString(),
    createdAtLabel: formatShortDate(session.createdAt.toISOString()),
  }));
}
