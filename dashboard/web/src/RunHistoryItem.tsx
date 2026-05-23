import type { RunState } from "./types";
import { formatMessageCount } from "./runDisplayName";
import { formatProgressPct, formatRunTimestamp, getOutcomeMeta, isNonSuccessRun } from "./runOutcome";
import { RunTitle } from "./RunTitle";
import { UiIcon } from "./ui/icons";
import { CheckCircle2 } from "lucide-react";

type Props = {
  run: RunState;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function RunHistoryItem({ run, selected, disabled, onSelect }: Props) {
  const outcome = getOutcomeMeta(run);
  const isSuccess = run.status === "completed";
  const isFailed = isNonSuccessRun(run);
  const messageLabel = formatMessageCount(run.live?.messages_processed);
  const progressLabel = formatProgressPct(run.live?.progress_pct);

  return (
    <button
      type="button"
      className={selected ? "history-item selected" : "history-item"}
      data-outcome={isSuccess ? "completed" : isFailed ? outcome?.tone ?? "failed" : run.status}
      title={run.run_id}
      onClick={onSelect}
      disabled={disabled}
    >
      <div className="history-item-main">
        <span className={`history-item-icon ${isSuccess ? "tone-success" : isFailed ? `tone-${outcome?.tone ?? "failed"}` : ""}`}>
          {isSuccess ? (
            <UiIcon icon={CheckCircle2} size="sm" />
          ) : outcome ? (
            <UiIcon icon={outcome.icon} size="sm" />
          ) : (
            <span className="history-item-dot" />
          )}
        </span>
        <div className="history-item-text">
          <RunTitle runId={run.run_id} className="history-item-title" />
          <span className="history-item-sub">
            {isSuccess ? (
              <>
                Completed · {progressLabel} · {messageLabel}
              </>
            ) : outcome ? (
              <>
                {outcome.shortLabel} · {progressLabel} · {messageLabel}
              </>
            ) : (
              <>
                <span className="history-item-status">{run.status}</span> · {progressLabel} · {messageLabel}
              </>
            )}
          </span>
        </div>
      </div>
      <span className="history-item-time">{formatRunTimestamp(run.finished_at ?? run.started_at)}</span>
    </button>
  );
}
