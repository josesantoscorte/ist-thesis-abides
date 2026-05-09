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
  simulation_process?: {
    available?: boolean;
    cpu_percent?: number;
    memory_rss_mb?: number;
    memory_vms_mb?: number;
    threads?: number;
    open_files?: number;
    status?: string;
    uptime_seconds?: number | null;
    reason?: string;
  };
  api_process?: {
    available?: boolean;
    cpu_percent?: number;
    memory_rss_mb?: number;
    memory_vms_mb?: number;
    threads?: number;
    open_files?: number;
    status?: string;
    uptime_seconds?: number | null;
    reason?: string;
  };
  host_system?: {
    available?: boolean;
    cpu_percent?: number;
    ram_percent?: number;
    ram_used_gb?: number;
    ram_total_gb?: number;
    reason?: string;
  };
  gpu?: {
    available?: boolean;
    source?: string;
    gpu_count?: number;
    utilization_percent?: number;
    memory_used_mb?: number;
    memory_total_mb?: number;
    process_memory_mb?: number | null;
    reason?: string;
  };
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

export interface MonitorSnapshot {
  host_system?: {
    available?: boolean;
    cpu_percent?: number;
    ram_percent?: number;
    ram_used_gb?: number;
    ram_total_gb?: number;
    reason?: string;
  };
  api_process?: {
    available?: boolean;
    cpu_percent?: number;
    memory_rss_mb?: number;
    reason?: string;
  };
  gpu?: {
    available?: boolean;
    utilization_percent?: number;
    reason?: string;
  };
  current_run_id?: string | null;
}
