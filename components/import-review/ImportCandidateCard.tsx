import { ImportWarnings } from "@/components/import-review/ImportWarnings";
import { importReviewStyles as styles } from "@/components/import-review/ImportReview.styles";
import { MatchingEditor } from "@/components/import-review/MatchingEditor";
import { MultipleChoiceEditor } from "@/components/import-review/MultipleChoiceEditor";
import { MultiSelectEditor } from "@/components/import-review/MultiSelectEditor";
import { QuestionTypeSelector } from "@/components/import-review/QuestionTypeSelector";
import { RevealAnswerEditor } from "@/components/import-review/RevealAnswerEditor";
import { StatementJudgementEditor } from "@/components/import-review/StatementJudgementEditor";
import { TrueFalseEditor } from "@/components/import-review/TrueFalseEditor";
import { createOptionId, ensureUniqueOptionIds, getImportCandidateStatus } from "@/lib/questionnaire-import";
import type { ImportCandidate, ImportDetectedType, ReviewStatus } from "@/lib/questionnaire-import";

interface ImportCandidateCardProps {
  candidate: ImportCandidate;
  onApprove: () => void;
  onChange: (updates: Partial<ImportCandidate>) => void;
  onReject: () => void;
  onToggleSelected: () => void;
}

function buildDefaultOptions(candidateId: string, count: number) {
  return Array.from({ length: count }, () => ({
    id: createOptionId(candidateId),
    text: "",
  }));
}

function buildStatementOptions(candidateId: string) {
  return ["01", "02", "04", "08", "16"].map((label) => ({
    id: createOptionId(candidateId),
    label,
    text: "",
    isCorrect: false,
  }));
}

function prepareCandidateForType(candidate: ImportCandidate, type: ImportDetectedType) {
  if (type === "MULTIPLE_CHOICE") {
    return ensureUniqueOptionIds({
      ...candidate,
      detectedType: type,
      answer: undefined,
      matchingPairs: undefined,
      options: candidate.options && candidate.options.length > 0 ? candidate.options : buildDefaultOptions(candidate.id, 2),
    }).candidate;
  }

  if (type === "MULTI_SELECT") {
    return ensureUniqueOptionIds({
      ...candidate,
      detectedType: type,
      answer: undefined,
      matchingPairs: undefined,
      options: candidate.options && candidate.options.length > 0 ? candidate.options : buildDefaultOptions(candidate.id, 3),
    }).candidate;
  }

  if (type === "STATEMENT_JUDGEMENT") {
    return ensureUniqueOptionIds({
      ...candidate,
      detectedType: type,
      answer: undefined,
      matchingPairs: undefined,
      options: candidate.options && candidate.options.length > 0 ? candidate.options : buildStatementOptions(candidate.id),
    }).candidate;
  }

  if (type === "MATCHING") {
    return {
      ...candidate,
      detectedType: type,
      answer: undefined,
      options: undefined,
      matchingPairs: candidate.matchingPairs && candidate.matchingPairs.length > 0 ? candidate.matchingPairs : [
        { left: "", right: "" },
        { left: "", right: "" },
      ],
    };
  }

  return {
    ...candidate,
    detectedType: type,
    options: undefined,
    matchingPairs: undefined,
  };
}

function renderEditor(candidate: ImportCandidate, onChange: (updates: Partial<ImportCandidate>) => void) {
  if (candidate.detectedType === "MULTIPLE_CHOICE") {
    return (
      <>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Pergunta</span>
          <textarea
            value={candidate.question ?? ""}
            onChange={(event) => onChange({ question: event.target.value })}
            className={styles.textarea}
          />
        </label>
        <MultipleChoiceEditor candidate={candidate} onChange={onChange} />
      </>
    );
  }

  if (candidate.detectedType === "MULTI_SELECT") {
    return (
      <>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Pergunta</span>
          <textarea
            value={candidate.question ?? ""}
            onChange={(event) => onChange({ question: event.target.value })}
            className={styles.textarea}
          />
        </label>
        <MultiSelectEditor candidate={candidate} onChange={onChange} />
      </>
    );
  }

  if (candidate.detectedType === "STATEMENT_JUDGEMENT") {
    return (
      <>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Enunciado</span>
          <textarea
            value={candidate.question ?? ""}
            onChange={(event) => onChange({ question: event.target.value })}
            className={styles.textarea}
          />
        </label>
        <StatementJudgementEditor candidate={candidate} onChange={onChange} />
      </>
    );
  }

  if (candidate.detectedType === "TRUE_FALSE") {
    return <TrueFalseEditor candidate={candidate} onChange={onChange} />;
  }

  if (candidate.detectedType === "MATCHING") {
    return (
      <>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Instrucao</span>
          <textarea
            value={candidate.question ?? ""}
            onChange={(event) => onChange({ question: event.target.value })}
            className={styles.compactTextarea}
          />
        </label>
        <MatchingEditor candidate={candidate} onChange={onChange} />
      </>
    );
  }

  if (candidate.detectedType === "FLASHCARD") {
    return <RevealAnswerEditor candidate={candidate} promptLabel="Frente" answerLabel="Verso" onChange={onChange} />;
  }

  if (candidate.detectedType === "FILL_BLANK") {
    return <RevealAnswerEditor candidate={candidate} promptLabel="Enunciado com lacuna" answerLabel="Resposta" onChange={onChange} />;
  }

  return <RevealAnswerEditor candidate={candidate} onChange={onChange} />;
}

function formatReviewStatus(status: ReviewStatus) {
  if (status === "CONFIRMED") {
    return "CONFIRMED";
  }

  if (status === "PENDING") {
    return "PENDING";
  }

  return "REJECTED";
}

function formatOrigin(candidate: ImportCandidate) {
  const source = candidate.sourceNumber ? `Questao ${candidate.sourceNumber}` : "Questao sem numero";
  const pages =
    candidate.sourcePageStart && candidate.sourcePageEnd
      ? candidate.sourcePageStart === candidate.sourcePageEnd
        ? `pagina ${candidate.sourcePageStart}`
        : `paginas ${candidate.sourcePageStart}-${candidate.sourcePageEnd}`
      : candidate.sourcePageStart
        ? `pagina ${candidate.sourcePageStart}`
        : "pagina nao identificada";

  return `${source} • ${pages}`;
}

export function ImportCandidateCard({
  candidate,
  onApprove,
  onChange,
  onReject,
  onToggleSelected,
}: ImportCandidateCardProps) {
  const parserStatus = getImportCandidateStatus(candidate);
  const preparedCandidate = ensureUniqueOptionIds(candidate).candidate;
  const reviewStatus = preparedCandidate.reviewStatus ?? "PENDING";
  const combinedWarnings = preparedCandidate.visualContextWarning
    ? uniqueWarningList([...(preparedCandidate.warnings ?? []), preparedCandidate.visualContextWarning])
    : preparedCandidate.warnings ?? [];

  return (
    <article className={styles.card({ highlighted: reviewStatus !== "CONFIRMED" })}>
      <div className={styles.cardHeader}>
        <div className={styles.cardMeta}>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={Boolean(preparedCandidate.selected)} onChange={onToggleSelected} />
            Incluir na importacao
          </label>
          <div className={styles.badgeStack}>
            <span className={styles.reviewBadge({ status: reviewStatus })}>{formatReviewStatus(reviewStatus)}</span>
            <span className={styles.confidenceBadge({ status: parserStatus })}>
              {parserStatus.replaceAll("_", " ")}
            </span>
            <span className={styles.parserBadge}>{preparedCandidate.parserName}</span>
            <span className={styles.parserBadge}>{formatOrigin(preparedCandidate)}</span>
          </div>
        </div>

        <div className={styles.cardActions}>
          <QuestionTypeSelector
            value={preparedCandidate.detectedType}
            onChange={(nextType) => onChange(prepareCandidateForType(preparedCandidate, nextType))}
          />
        </div>
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Confianca</span>
          <p className={styles.helperText}>{Math.round(preparedCandidate.confidence * 100)}%</p>
          {preparedCandidate.parentSourceNumber ? (
            <p className={styles.helperText}>Subitem da questao {preparedCandidate.parentSourceNumber}</p>
          ) : null}
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Bloco bruto</span>
          <div className={styles.rawBlock}>{preparedCandidate.rawBlock}</div>
        </div>
      </div>

      {preparedCandidate.contextBlocks && preparedCandidate.contextBlocks.length > 0 ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Contexto extraido</span>
          {preparedCandidate.contextBlocks.map((block) => (
            <div key={`${preparedCandidate.id}-${block.type}`} className={styles.rawBlock}>
              {block.content}
            </div>
          ))}
        </div>
      ) : null}

      {renderEditor(preparedCandidate, onChange)}

      <div className={styles.footerActions}>
        <button type="button" onClick={onApprove} className={styles.primaryButton}>
          Aprovar questao
        </button>
        <button type="button" onClick={onReject} className={styles.secondaryButton}>
          Rejeitar questao
        </button>
      </div>

      <ImportWarnings title="Pendencias para aprovar" warnings={preparedCandidate.validationErrors ?? []} />
      <ImportWarnings warnings={combinedWarnings} />
    </article>
  );
}

function uniqueWarningList(warnings: string[]) {
  return [...new Set(warnings.filter(Boolean))];
}
