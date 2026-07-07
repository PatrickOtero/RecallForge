"use client";

import { ArrowRight, Gauge, RotateCcw, Sparkles } from "lucide-react";

import type { QuizResultSummary as QuizResult, QuizSession } from "@/lib/types";
import { quizResultSummaryStyles as styles } from "./QuizResultSummary.styles";

interface QuizResultSummaryProps {
  session: QuizSession;
  summary: QuizResult;
  onBackToModes: () => void;
  onRestartSameMode: () => void;
  onStartOver: () => void;
}

export function QuizResultSummary({
  session,
  summary,
  onBackToModes,
  onRestartSameMode,
  onStartOver,
}: QuizResultSummaryProps) {
  return (
    <div className={styles.root}>
      <div className={styles.heroCard}>
        <div className={styles.heroLayout}>
          <div>
            <p className={styles.eyebrow}>Resultado final</p>
            <h2 className={styles.title}>{session.title}</h2>
            <p className={styles.description}>
              Veja onde você foi bem e quais pontos merecem uma revisão mais atenta.
            </p>
          </div>

          <div className={styles.scoreBadge}>
            <div className={styles.scoreContent}>
              <p className={styles.scoreLabel}>Nota</p>
              <p className={styles.scoreValue}>{summary.score}</p>
            </div>
          </div>
        </div>
      </div>

      {session.generationNote ? (
        <div className={styles.generationNote}>
          {session.generationNote}
        </div>
      ) : null}

      <div className={styles.statsGrid}>
        <div className={styles.correctStat}>
          <Gauge className={styles.statIcon} />
          <p className={styles.darkStatLabel}>Acertos</p>
          <p className={styles.darkStatValue}>{summary.correctCount}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Erros</p>
          <p className={styles.statValue}>{summary.wrongCount}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Perguntas</p>
          <p className={styles.statValue}>{session.questionCount}</p>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <p className={styles.sectionTitle}>Pontos para revisar</p>
          <div className={styles.topics}>
            {summary.weakTopics.length > 0 ? (
              summary.weakTopics.map((topic) => (
                <span key={topic} className={styles.weakTopic}>
                  {topic}
                </span>
              ))
            ) : (
              <span className={styles.clearTopic}>
                Nenhum ponto ficou muito frágil nesta rodada
              </span>
            )}
          </div>
        </div>

        <div className={styles.detailCard}>
          <div className={styles.recommendationHeader}>
            <Sparkles className={styles.recommendationIcon} />
            <p className={styles.sectionTitle}>Próximos passos</p>
          </div>
          <div className={styles.recommendations}>
            {summary.recommendations.map((recommendation) => (
              <div key={recommendation} className={styles.recommendationItem}>
                <ArrowRight className={styles.recommendationArrow} />
                {recommendation}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={onBackToModes} className={styles.primaryButton}>
          <ArrowRight className={styles.actionIcon} />
          Tentar outro modo com este material
        </button>
        <button type="button" onClick={onRestartSameMode} className={styles.secondaryButton}>
          <RotateCcw className={styles.actionIcon} />
          Refazer este questionário
        </button>
        <button type="button" onClick={onBackToModes} className={styles.secondaryButton}>
          Voltar aos modos de estudo
        </button>
        <button type="button" onClick={onStartOver} className={styles.secondaryButton}>
          Estudar outro material
        </button>
      </div>
    </div>
  );
}
