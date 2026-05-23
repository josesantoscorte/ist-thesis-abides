import { getRunDisplayName } from "./runDisplayName";

type Props = {
  runId: string;
  /** Show backend id under the codename (mono, muted). */
  showTechnicalId?: boolean;
  className?: string;
};

export function RunTitle({ runId, showTechnicalId = false, className }: Props) {
  const displayName = getRunDisplayName(runId);
  return (
    <span className={className ? `run-title ${className}` : "run-title"} title={runId}>
      <span className="run-display-name">{displayName}</span>
      {showTechnicalId && <span className="run-technical-id">{runId}</span>}
    </span>
  );
}
