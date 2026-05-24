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
import { getCurrentRun, getMonitorSnapshot, getRunResults, getRunTelemetry, getRuns, startRun, stopCurrentRun } from "./api";
import { LiveAgentGraph } from "./LiveAgentGraph";
import { RunHistoryItem } from "./RunHistoryItem";
import { RunOutcomePanel } from "./RunOutcomePanel";
import { isNonSuccessRun } from "./runOutcome";
import { formatMessageCount } from "./runDisplayName";
import { RunTitle } from "./RunTitle";
import type { MonitorSnapshot, ResultsResponse, RunState, SimulationParams, TelemetryEvent } from "./types";
import { ParameterSidebar } from "./ParameterSidebar";
import { defaultParams, type PresetKey } from "./simulationConfig";
import { Activity, BarChart3, Cpu, Gauge, Play, Square, UiIcon } from "./ui/icons";
import "./styles.css";

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

function percentValue(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function mbValue(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)} MB`;
}

export default function App() {
  const [params, setParams] = useState<SimulationParams>(defaultParams);
  const [run, setRun] = useState<RunState | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"monitor" | "results">("monitor");
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>("baseline");
  const [chartRange, setChartRange] = useState<25 | 50 | 100>(50);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => {
    return window.localStorage.getItem("abides.selected.run");
  });
  const [monitor, setMonitor] = useState<MonitorSnapshot | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousRunStatus = useRef<RunState["status"] | null>(null);
  const previousRunId = useRef<string | null>(null);

  const isActive = run?.status === "running" || run?.status === "stopping";
  const statusTone = run?.status ?? "idle";

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const [current, history, monitorSnapshot] = await Promise.all([getCurrentRun(), getRuns(), getMonitorSnapshot()]);
        if (!mounted) return;
        setRun(current);
        setRuns(history);
        setMonitor(monitorSnapshot);
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
    if (!run || (run.status !== "running" && run.status !== "stopping")) {
      return;
    }
    let cancelled = false;
    const rid = run.run_id;

    const pollTelemetry = async () => {
      try {
        const tel = await getRunTelemetry(rid, 8000);
        if (!cancelled) setTelemetry(tel.events);
      } catch {
        if (!cancelled) setTelemetry([]);
      }
    };

    void pollTelemetry();
    const id = window.setInterval(() => void pollTelemetry(), 550);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [run?.run_id, run?.status]);

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
    const activeRunId = run?.run_id ?? null;
    setLoading(true);
    setError(null);
    try {
      const ended = await stopCurrentRun();
      setRun(null);
      setTelemetry([]);
      const nextRuns = [ended, ...runs.filter((entry) => entry.run_id !== ended.run_id)];
      setRuns(nextRuns);
      previousRunId.current = activeRunId ?? ended.run_id;
      previousRunStatus.current = "running";
      setActiveTab("results");
      setSelectedRunId(ended.run_id);
      await loadResults(ended.run_id, nextRuns);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async (runId: string, runList: RunState[] = runs) => {
    setLoading(true);
    setError(null);
    const meta = runList.find((entry) => entry.run_id === runId);
    try {
      const response = await getRunResults(runId);
      setResults(response);
      setSelectedRunId(runId);
    } catch (e) {
      if (meta && isNonSuccessRun(meta)) {
        setResults(null);
        setSelectedRunId(runId);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedRun = useMemo(
    () => runs.find((entry) => entry.run_id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

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
              <UiIcon icon={Play} size="sm" />
              Run
            </button>
            <button className="secondary" onClick={stop} disabled={loading || !isActive}>
              <UiIcon icon={Square} size="sm" />
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
            <UiIcon icon={Activity} />
            Live Monitor
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
            <UiIcon icon={BarChart3} />
            History & Results
          </button>
        </div>
      </header>

      <div className={activeTab === "monitor" ? "app-shell" : "app-shell app-shell--full"}>
        {activeTab === "monitor" && (
          <ParameterSidebar
            params={params}
            selectedPreset={selectedPreset}
            onPresetChange={setSelectedPreset}
            onParamsChange={setParams}
            disabled={isActive}
          />
        )}

        <main className="workspace">
          {activeTab === "monitor" ? (
          <section className="live-monitor-layout">
            <section className="panel">
              <h3>System Telemetry</h3>
              <div className="monitor-groups">
                <div className="monitor-box">
                  <h4>
                    <UiIcon icon={Cpu} />
                    Hardware
                  </h4>
                  <div className="kpis live-kpis live-top-metrics">
                    <div className="kpi">
                      <strong>Host CPU</strong>
                      <span>{percentValue(monitor?.host_system?.cpu_percent)}</span>
                    </div>
                  </div>
                </div>
                <div className="monitor-box">
                  <h4>
                    <UiIcon icon={Gauge} />
                    Simulation Runtime
                  </h4>
                  <div className="kpis live-kpis live-top-metrics">
                    <div className="kpi">
                      <strong>Simulation CPU</strong>
                      <span>{run ? percentValue(run.live.simulation_process?.cpu_percent) : "-"}</span>
                    </div>
                    <div className="kpi">
                      <strong>Simulation RAM (RSS)</strong>
                      <span>{run ? mbValue(run.live.simulation_process?.memory_rss_mb) : "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section className="panel">
              <h3>Simulation Monitoring</h3>
              {run ? (
                <>
                  <div className="kpis live-kpis">
                    <div className="kpi">
                      <strong>Status</strong>
                      <span>{run.status}</span>
                    </div>
                    <div className="kpi">
                      <strong>Messages</strong>
                      <span>{formatMessageCount(run.live.messages_processed)}</span>
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

                  <LiveAgentGraph run={run} params={params} telemetry={telemetry} />

                  <h3 className="subsection">Recent Runtime Logs</h3>
                  <pre className="logs">{run.recent_logs.slice(-26).join("\n")}</pre>
                </>
              ) : (
                <>
                  <p>No active run. Pick a preset or tune parameters in the configuration panel, then press Run.</p>
                  <LiveAgentGraph run={null} params={params} telemetry={[]} />
                </>
              )}
            </section>
          </section>
          ) : (
          <section className="split-layout">
            <div className="panel history-panel">
              <h3>Run History</h3>
              <p>Select any run to load metrics and charts.</p>
              <div className="history">
                {runs.slice(0, 20).map((item) => (
                  <RunHistoryItem
                    key={item.run_id}
                    run={item}
                    selected={selectedRunId === item.run_id}
                    disabled={loading}
                    onSelect={() => void loadResults(item.run_id)}
                  />
                ))}
              </div>
            </div>

            <div className="panel results-panel">
              <h3>Results</h3>
              {selectedRun && isNonSuccessRun(selectedRun) && !results ? (
                <>
                  <p className="results-run-label">
                    <RunTitle runId={selectedRun.run_id} showTechnicalId />
                  </p>
                  <RunOutcomePanel run={selectedRun} />
                </>
              ) : results ? (
                <>
                  <p className="results-run-label">
                    <RunTitle runId={results.run_id} showTechnicalId />
                  </p>
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
