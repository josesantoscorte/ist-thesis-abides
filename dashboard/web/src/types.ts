export type RunStatus = "running" | "stopping" | "stopped" | "completed" | "failed";

export interface SimulationParams {
  seed: number | null;
  households: number;
  firms: number;
  months: number;
  wake_hours: number;
  automation_adoption_rate: number;
  task_substitution_elasticity: number;
  productivity_gain_factor: number;
  labor_displacement_lag: number;
  income_tax_rate: number;
  unemployment_support: number;
  retraining_subsidy: number;
  neutral_rate: number;
}

export interface LiveState {
  simulation_time: string | null;
  messages_processed: number;
  wallclock_elapsed: string | null;
  progress_pct: number;
}

export interface RunState {
  run_id: string;
  params: SimulationParams;
  log_dir: string;
  status: RunStatus;
  pid: number | null;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  live: LiveState;
  recent_logs: string[];
}

export interface ResultsResponse {
  run_id: string;
  log_dir: string;
  stats: Record<string, unknown>;
  timeseries: Array<Record<string, string | number>>;
}
