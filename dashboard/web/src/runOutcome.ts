import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CircleHelp,
  OctagonX,
  Power,
  RefreshCw,
  Skull,
  Square
} from "lucide-react";
import type { FailureReason, RunState } from "./types";

export type OutcomeTone = "success" | "stopped" | "failed" | "neutral";

export type OutcomeMeta = {
  reason: FailureReason;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  tone: OutcomeTone;
};

const OUTCOME_META: Record<FailureReason, OutcomeMeta> = {
  user_stopped: {
    reason: "user_stopped",
    label: "Stopped by you",
    shortLabel: "Stopped",
    description: "The simulation was stopped from the dashboard before it finished.",
    icon: Square,
    tone: "stopped"
  },
  dashboard_restart: {
    reason: "dashboard_restart",
    label: "Dashboard restarted",
    shortLabel: "Interrupted",
    description: "The dashboard or API server restarted while this run was still active.",
    icon: RefreshCw,
    tone: "failed"
  },
  process_error: {
    reason: "process_error",
    label: "Simulation error",
    shortLabel: "Error",
    description: "The simulation process exited with a non-zero status code.",
    icon: AlertTriangle,
    tone: "failed"
  },
  signal_killed: {
    reason: "signal_killed",
    label: "Process killed",
    shortLabel: "Killed",
    description: "The OS terminated the simulation (often out-of-memory or SIGKILL).",
    icon: Skull,
    tone: "failed"
  },
  signal_terminated: {
    reason: "signal_terminated",
    label: "Signal shutdown",
    shortLabel: "Signaled",
    description: "The simulation received a termination signal (SIGTERM or SIGINT).",
    icon: OctagonX,
    tone: "failed"
  },
  start_failed: {
    reason: "start_failed",
    label: "Failed to start",
    shortLabel: "Start failed",
    description: "The simulation process could not be launched.",
    icon: Power,
    tone: "failed"
  },
  unknown: {
    reason: "unknown",
    label: "Ended unexpectedly",
    shortLabel: "Unknown",
    description: "The run did not complete successfully; the exact cause was not recorded.",
    icon: CircleHelp,
    tone: "failed"
  }
};

function classifyExitCode(exitCode: number | null | undefined): FailureReason | null {
  if (exitCode === null || exitCode === undefined) return null;
  if (exitCode === 0) return null;
  if (exitCode === 137 || exitCode === -9 || exitCode === 9) return "signal_killed";
  if (exitCode === -15 || exitCode === 15 || exitCode === -2 || exitCode === 2) return "signal_terminated";
  return "process_error";
}

/** Infer failure_reason for runs persisted before structured tracking existed. */
export function inferFailureReason(run: RunState): FailureReason | null {
  if (run.failure_reason) return run.failure_reason;
  if (run.status === "completed") return null;

  const err = (run.error ?? "").toLowerCase();
  if (err.includes("stopped from dashboard") || err.includes("requested stop")) {
    return "user_stopped";
  }
  if (err.includes("interrupted by dashboard restart")) {
    return "dashboard_restart";
  }
  if (run.status === "stopped") {
    return "user_stopped";
  }
  return classifyExitCode(run.exit_code) ?? "unknown";
}

export function getOutcomeMeta(run: RunState): OutcomeMeta | null {
  const reason = inferFailureReason(run);
  if (!reason) return null;
  return OUTCOME_META[reason];
}

export function isNonSuccessRun(run: RunState): boolean {
  return run.status === "failed" || run.status === "stopped";
}

export function formatExitCode(exitCode: number | null | undefined): string {
  if (exitCode === null || exitCode === undefined) return "—";
  if (exitCode === 0) return "0 (ok)";
  const signal = exitCode < 0 ? `signal ${-exitCode}` : `code ${exitCode}`;
  return `${exitCode} (${signal})`;
}

export function formatRunTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export function formatRunDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  try {
    const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return `${min}m ${sec}s`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  } catch {
    return "—";
  }
}

export function formatProgressPct(pct: number | undefined): string {
  if (pct === undefined || Number.isNaN(pct)) return "—";
  return `${pct.toFixed(1)}%`;
}
