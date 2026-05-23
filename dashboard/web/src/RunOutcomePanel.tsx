import type { RunState } from "./types";
import { formatMessageCount } from "./runDisplayName";
import {
  formatExitCode,
  formatProgressPct,
  formatRunDuration,
  formatRunTimestamp,
  getOutcomeMeta
} from "./runOutcome";
import { RunTitle } from "./RunTitle";
import { UiIcon } from "./ui/icons";

type Props = {
  run: RunState;
};

export function RunOutcomePanel({ run }: Props) {
  const outcome = getOutcomeMeta(run);
  if (!outcome) {
    return null;
  }

  const detail = run.failure_detail?.trim() || run.error?.trim() || null;
  const recentTail = run.recent_logs?.length ? run.recent_logs.slice(-12).join("\n") : null;

  return (
    <div className="run-outcome" data-tone={outcome.tone}>
      <div className="run-outcome-header">
        <span className="run-outcome-icon">
          <UiIcon icon={outcome.icon} size="lg" />
        </span>
        <div>
          <RunTitle runId={run.run_id} showTechnicalId className="run-outcome-title" />
          <h4>{outcome.label}</h4>
          <p>{outcome.description}</p>
        </div>
      </div>

      <div className="run-outcome-stats">
        <div className="run-outcome-stat">
          <strong>Progress</strong>
          <span>{formatProgressPct(run.live.progress_pct)}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Messages</strong>
          <span>{formatMessageCount(run.live?.messages_processed)}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Sim time</strong>
          <span className="value-nowrap">{run.live.simulation_time ?? "—"}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Wallclock</strong>
          <span className="value-nowrap">{run.live.wallclock_elapsed ?? "—"}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Exit</strong>
          <span>{formatExitCode(run.exit_code)}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Duration</strong>
          <span>{formatRunDuration(run.started_at, run.finished_at)}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Ended</strong>
          <span>{formatRunTimestamp(run.finished_at)}</span>
        </div>
        <div className="run-outcome-stat">
          <strong>Log dir</strong>
          <span className="mono">{run.log_dir}</span>
        </div>
      </div>

      {detail && (
        <div className="run-outcome-detail">
          <strong>Details</strong>
          <p>{detail}</p>
        </div>
      )}

      {recentTail && (
        <>
          <h4 className="subsection">Last runtime logs</h4>
          <pre className="logs run-outcome-logs">{recentTail}</pre>
        </>
      )}
    </div>
  );
}
