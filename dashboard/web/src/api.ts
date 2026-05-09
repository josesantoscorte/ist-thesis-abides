import type { MonitorSnapshot, ResultsResponse, RunState, SimulationParams } from "./types";

const API_BASE = "http://127.0.0.1:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getCurrentRun(): Promise<RunState | null> {
  const payload = await request<{ run: RunState | null }>("/runs/current");
  return payload.run;
}

export async function getRuns(): Promise<RunState[]> {
  const payload = await request<{ runs: RunState[] }>("/runs");
  return payload.runs;
}

export async function startRun(params: SimulationParams): Promise<RunState> {
  const payload = await request<{ run: RunState }>("/runs", {
    method: "POST",
    body: JSON.stringify({ params, verbose: false })
  });
  return payload.run;
}

export async function stopCurrentRun(): Promise<RunState> {
  const payload = await request<{ run: RunState }>("/runs/current/stop", { method: "POST" });
  return payload.run;
}

export async function getRunResults(runId: string): Promise<ResultsResponse> {
  return request<ResultsResponse>(`/runs/${runId}/results`);
}

export async function getMonitorSnapshot(): Promise<MonitorSnapshot> {
  return request<MonitorSnapshot>("/monitor");
}
