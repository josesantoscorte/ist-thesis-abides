import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getCurrentRun, getRunResults, getRuns, startRun, stopCurrentRun } from "./api";
import type { ResultsResponse, RunState, SimulationParams } from "./types";
import "./styles.css";

const defaultParams: SimulationParams = {
  seed: null,
  households: 120,
  firms: 15,
  months: 18,
  wake_hours: 24,
  automation_adoption_rate: 0.02,
  task_substitution_elasticity: 0.3,
  productivity_gain_factor: 0.45,
  labor_displacement_lag: 3,
  income_tax_rate: 0.18,
  unemployment_support: 9000,
  retraining_subsidy: 0.03,
  neutral_rate: 0.02
};

const presetConfigs: Record<"baseline" | "high-automation" | "high-tax", SimulationParams> = {
  baseline: defaultParams,
  "high-automation": {
    ...defaultParams,
    automation_adoption_rate: 0.07,
    task_substitution_elasticity: 0.55,
    productivity_gain_factor: 0.85,
    labor_displacement_lag: 2
  },
  "high-tax": {
    ...defaultParams,
    income_tax_rate: 0.35,
    unemployment_support: 14000,
    retraining_subsidy: 0.08,
    neutral_rate: 0.025
  }
};

const fieldLimits: Partial<Record<keyof SimulationParams, { min: number; max: number }>> = {
  seed: { min: 0, max: 4294967295 },
  households: { min: 1, max: 20000 },
  firms: { min: 1, max: 5000 },
  months: { min: 1, max: 120 },
  wake_hours: { min: 1, max: 168 },
  automation_adoption_rate: { min: 0, max: 1 },
  task_substitution_elasticity: { min: 0, max: 3 },
  productivity_gain_factor: { min: 0, max: 3 },
  labor_displacement_lag: { min: 1, max: 24 },
  income_tax_rate: { min: 0, max: 1 },
  unemployment_support: { min: 0, max: 1000000 },
  retraining_subsidy: { min: 0, max: 1 },
  neutral_rate: { min: -0.1, max: 1 }
};

const chartColors = {
  blue: "#0072B2",
  vermillion: "#D55E00",
  bluishGreen: "#009E73",
  reddishPurple: "#CC79A7"
};

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function App() {
  const [params, setParams] = useState<SimulationParams>(defaultParams);
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"monitor" | "results">("monitor");
  const [selectedPreset, setSelectedPreset] = useState<"baseline" | "high-automation" | "high-tax">("baseline");
  const [chartRange, setChartRange] = useState<25 | 50 | 100>(50);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => {
    return window.localStorage.getItem("abides.selected.run");
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousRunStatus = useRef<RunState["status"] | null>(null);
  const previousRunId = useRef<string | null>(null);

  const isActive = run?.status === "running" || run?.status === "stopping";
  const paramKeys = Object.keys(params) as Array<keyof SimulationParams>;
  const statusTone = run?.status ?? "idle";

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const [current, history] = await Promise.all([getCurrentRun(), getRuns()]);
        if (!mounted) return;
        setRun(current);
        setRuns(history);
      } catch (e) {
        if (!mounted) return;
        setError((e as Error).message);
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      window.localStorage.setItem("abides.selected.run", selectedRunId);
      return;
    }
    window.localStorage.removeItem("abides.selected.run");
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedRunId || runs.length === 0) {
      return;
    }
    const exists = runs.some((entry) => entry.run_id === selectedRunId);
    if (!exists) {
      return;
    }
    if (results?.run_id === selectedRunId) {
      return;
    }
    void loadResults(selectedRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId, runs]);

  useEffect(() => {
    if (runs.length === 0) {
      return;
    }
    if (selectedRunId && runs.some((entry) => entry.run_id === selectedRunId)) {
      return;
    }
    const latest = runs[0];
    setSelectedRunId(latest.run_id);
    if (activeTab === "results") {
      void loadResults(latest.run_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, selectedRunId, activeTab]);

  useEffect(() => {
    if (!run) {
      const previouslyActive =
        previousRunId.current &&
        (previousRunStatus.current === "running" || previousRunStatus.current === "stopping");

      if (previouslyActive) {
        const endedRun = runs.find((entry) => entry.run_id === previousRunId.current);
        const ended =
          endedRun &&
          (endedRun.status === "completed" || endedRun.status === "failed" || endedRun.status === "stopped");
        if (ended && endedRun) {
          setActiveTab("results");
          setSelectedRunId(endedRun.run_id);
          void loadResults(endedRun.run_id);
        }
      }

      previousRunStatus.current = null;
      previousRunId.current = null;
      return;
    }

    const wasRunning =
      previousRunId.current === run.run_id &&
      (previousRunStatus.current === "running" || previousRunStatus.current === "stopping");
    const isFinished = run.status === "completed" || run.status === "failed" || run.status === "stopped";

    if (wasRunning && isFinished) {
      setActiveTab("results");
      setSelectedRunId(run.run_id);
      void loadResults(run.run_id);
    }

    previousRunStatus.current = run.status;
    previousRunId.current = run.run_id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, runs]);

  const applyPreset = (preset: "baseline" | "high-automation" | "high-tax") => {
    setSelectedPreset(preset);
    setParams({ ...presetConfigs[preset] });
  };

  const start = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const newRun = await startRun(params);
      setRun(newRun);
      setRuns((prev) => [newRun, ...prev.filter((x) => x.run_id !== newRun.run_id)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    setLoading(true);
    setError(null);
    try {
      const stopped = await stopCurrentRun();
      setRun(stopped);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async (runId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getRunResults(runId);
      setResults(response);
      setSelectedRunId(runId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    const stats = results?.stats ?? {};
    return {
      unemploymentRate: Number(stats.unemployment_rate ?? 0),
      avgHouseholdCash: Number(stats.average_household_cash_cents ?? 0),
      totalFirmCash: Number(stats.total_firm_cash_cents ?? 0),
      avgAutomation: Number(stats.average_firm_automation_level ?? 0),
      activeLoans: Number(stats.active_loans_count ?? 0),
      policyRate: Number(stats.final_policy_rate ?? 0),
      budget: Number(stats.government_budget_cents ?? 0)
    };
  }, [results]);

  const chartSeries = useMemo(() => {
    if (!results?.timeseries?.length) {
      return [];
    }
    return results.timeseries.slice(-chartRange);
  }, [results, chartRange]);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="workspace-top-left">
          <h1 className="workspace-title">ABIDES Dashboard</h1>
          <div className="sidebar-actions top-actions">
            <button onClick={start} disabled={loading || isActive}>
              Run
            </button>
            <button className="secondary" onClick={stop} disabled={loading || !isActive}>
              Stop
            </button>
            <div className="status-pill" data-tone={statusTone}>
              <span className="dot" />
              <span>{run ? `Run ${run.status}` : "No active run"}</span>
            </div>
          </div>
        </div>
        <div className="tabs">
          <button
            className={activeTab === "monitor" ? "tab active" : "tab"}
            onClick={() => setActiveTab("monitor")}
          >
            <span className="ui-icon">◍</span> Live Monitor
          </button>
          <button
            className={activeTab === "results" ? "tab active" : "tab"}
            onClick={() => {
              setActiveTab("results");
              if (runs.length > 0 && !selectedRunId) {
                void loadResults(runs[0].run_id);
              }
            }}
          >
            <span className="ui-icon">◫</span> History & Results
          </button>
        </div>
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <div className="preset-row">
            <label>
              <span>
                <span className="ui-icon">◉</span> Preset
              </span>
              <select
                value={selectedPreset}
                onChange={(e) => applyPreset(e.target.value as "baseline" | "high-automation" | "high-tax")}
              >
                <option value="baseline">baseline</option>
                <option value="high-automation">high-automation</option>
                <option value="high-tax">high-tax</option>
              </select>
            </label>
          </div>

          <div className="parameter-scroll">
            <h2>
              <span className="ui-icon">◧</span> Parameters
            </h2>
            <div className="parameter-grid">
              {paramKeys.map((key) => {
                const value = params[key];
                const limits = fieldLimits[key];
                return (
                  <label key={String(key)}>
                    <span>{String(key).replaceAll("_", " ")}</span>
                    <input
                      type="number"
                      min={limits?.min}
                      max={limits?.max}
                      step={typeof value === "number" && Math.abs(value) < 1 ? "0.01" : "1"}
                      value={value ?? ""}
                      placeholder={limits ? `${limits.min} - ${limits.max}` : undefined}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const parsed = raw === "" ? null : Number(raw);
                        const nextValue = Number.isNaN(parsed) ? value : parsed;
                        setParams((prev) => ({
                          ...prev,
                          [key]: nextValue as SimulationParams[typeof key]
                        }));
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="workspace">
          {activeTab === "monitor" ? (
          <section className="panel">
            <h3>Live Monitor</h3>
            {run ? (
              <>
                <div className="kpis live-kpis">
                  <div className="kpi">
                    <strong>Status</strong>
                    <span>{run.status}</span>
                  </div>
                  <div className="kpi">
                    <strong>Messages</strong>
                    <span>{run.live.messages_processed.toLocaleString()}</span>
                  </div>
                  <div className="kpi">
                    <strong>Simulation Time</strong>
                    <span className="value-nowrap">{run.live.simulation_time ?? "-"}</span>
                  </div>
                  <div className="kpi">
                    <strong>Wallclock</strong>
                    <span className="value-nowrap">{run.live.wallclock_elapsed ?? "-"}</span>
                  </div>
                </div>
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${run.live.progress_pct}%` }} />
                </div>
                <small>{run.live.progress_pct.toFixed(1)}% complete</small>

                <h3 className="subsection">Recent Runtime Logs</h3>
                <pre className="logs">{run.recent_logs.slice(-26).join("\n")}</pre>
              </>
            ) : (
              <p>No active run right now. Adjust parameters on the left and start a simulation.</p>
            )}
          </section>
          ) : (
          <section className="split-layout">
            <div className="panel history-panel">
              <h3>Run History</h3>
              <p>Select any run to load metrics and charts.</p>
              <div className="history">
                {runs.slice(0, 20).map((item) => (
                  <button
                    key={item.run_id}
                    className={selectedRunId === item.run_id ? "history-item selected" : "history-item"}
                    onClick={() => void loadResults(item.run_id)}
                    disabled={loading}
                  >
                    <span>{item.run_id}</span>
                    <span>{item.status}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel results-panel">
              <h3>Results</h3>
              {results ? (
                <>
                  <p>Loaded run: {results.run_id}</p>
                  <div className="kpis">
                    <div className="kpi">
                      <strong>Unemployment</strong>
                      <span>{pct(metrics.unemploymentRate)}</span>
                    </div>
                    <div className="kpi">
                      <strong>Avg Household Cash</strong>
                      <span>{money(metrics.avgHouseholdCash)}</span>
                    </div>
                    <div className="kpi">
                      <strong>Total Firm Cash</strong>
                      <span>{money(metrics.totalFirmCash)}</span>
                    </div>
                    <div className="kpi">
                      <strong>Avg Automation</strong>
                      <span>{metrics.avgAutomation.toFixed(3)}</span>
                    </div>
                    <div className="kpi">
                      <strong>Active Loans</strong>
                      <span>{metrics.activeLoans.toLocaleString()}</span>
                    </div>
                    <div className="kpi">
                      <strong>Policy Rate</strong>
                      <span>{(metrics.policyRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="kpi">
                      <strong>Gov Budget</strong>
                      <span>{money(metrics.budget)}</span>
                    </div>
                  </div>

                  <div className="chart-controls">
                    <span>Chart range</span>
                    <div className="range-group">
                      {[25, 50, 100].map((value) => (
                        <button
                          key={value}
                          className={chartRange === value ? "range-btn active" : "range-btn"}
                          onClick={() => setChartRange(value as 25 | 50 | 100)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="chart-wrap">
                    <h3>Production and Transfers</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="timestamp" hide />
                        <YAxis stroke="#a1a1aa" />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="production_units" stroke={chartColors.blue} dot={false} />
                        <Line type="monotone" dataKey="transfers_cents" stroke={chartColors.vermillion} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-wrap">
                    <h3>Income vs Consumption</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={chartSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="timestamp" hide />
                        <YAxis stroke="#a1a1aa" />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="wages_paid_cents"
                          stroke={chartColors.bluishGreen}
                          fill="#009E7330"
                        />
                        <Area
                          type="monotone"
                          dataKey="consumption_spend_cents"
                          stroke={chartColors.reddishPurple}
                          fill="#CC79A730"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p>No results loaded yet. Choose a run from the history list.</p>
              )}
            </div>
          </section>
          )}

          {error && <p className="error">{error}</p>}
        </main>
      </div>
    </div>
  );
}
