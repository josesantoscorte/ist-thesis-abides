import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Deque, Dict, List, Optional, Tuple

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
try:
    import psutil
except Exception:  # pragma: no cover - fallback when psutil unavailable
    psutil = None


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOG_ROOT = os.path.join(REPO_ROOT, "log")
RUN_HISTORY_PATH = os.path.join(REPO_ROOT, "dashboard", "run_history.json")
SIMULATION_START = pd.Timestamp("2035-01-01")

PROGRESS_RE = re.compile(
    r"Simulation time:\s*(.*?), messages processed:\s*(\d+), wallclock elapsed:\s*(.*?)(?:\s*---)?$"
)

FAILURE_REASONS = frozenset(
    {
        "user_stopped",
        "dashboard_restart",
        "process_error",
        "signal_killed",
        "signal_terminated",
        "start_failed",
        "unknown",
    }
)


class SimulationParams(BaseModel):
    seed: Optional[int] = None
    households: int = Field(default=120, ge=1, le=20000)
    firms: int = Field(default=15, ge=1, le=5000)
    months: int = Field(default=18, ge=1, le=120)
    wake_hours: int = Field(default=24, ge=1, le=168)

    automation_adoption_rate: float = Field(default=0.02, ge=0.0, le=1.0)
    task_substitution_elasticity: float = Field(default=0.30, ge=0.0, le=3.0)
    productivity_gain_factor: float = Field(default=0.45, ge=0.0, le=3.0)
    labor_displacement_lag: int = Field(default=3, ge=1, le=24)

    income_tax_rate: float = Field(default=0.18, ge=0.0, le=1.0)
    unemployment_support: int = Field(default=9000, ge=0, le=1_000_000)
    retraining_subsidy: float = Field(default=0.03, ge=0.0, le=1.0)
    neutral_rate: float = Field(default=0.02, ge=-0.1, le=1.0)


class StartSimulationRequest(BaseModel):
    log_dir: Optional[str] = None
    verbose: bool = False
    params: SimulationParams = Field(default_factory=SimulationParams)
    # Record one kernel sendMessage sample per N messages (0 disables). Written to log/<dir>/telemetry.jsonl
    telemetry_sample_n: int = Field(default=80, ge=0, le=500_000)


@dataclass
class LiveProgress:
    simulation_time: Optional[str] = None
    messages_processed: int = 0
    wallclock_elapsed: Optional[str] = None
    progress_pct: float = 0.0
    simulation_process: Dict[str, Any] = field(default_factory=dict)
    api_process: Dict[str, Any] = field(default_factory=dict)
    host_system: Dict[str, Any] = field(default_factory=dict)
    gpu: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RunState:
    run_id: str
    params: Dict[str, Any]
    log_dir: str
    status: str = "running"
    pid: Optional[int] = None
    started_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    finished_at: Optional[str] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    failure_reason: Optional[str] = None
    failure_detail: Optional[str] = None
    live: LiveProgress = field(default_factory=LiveProgress)
    lines: Deque[str] = field(default_factory=lambda: deque(maxlen=600))
    process: Optional[subprocess.Popen] = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    def as_dict(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "run_id": self.run_id,
                "params": self.params,
                "log_dir": self.log_dir,
                "status": self.status,
                "pid": self.pid,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "exit_code": self.exit_code,
                "error": self.error,
                "failure_reason": self.failure_reason,
                "failure_detail": self.failure_detail,
                "live": {
                    "simulation_time": self.live.simulation_time,
                    "messages_processed": self.live.messages_processed,
                    "wallclock_elapsed": self.live.wallclock_elapsed,
                    "progress_pct": self.live.progress_pct,
                    "simulation_process": self.live.simulation_process,
                    "api_process": self.live.api_process,
                    "host_system": self.live.host_system,
                    "gpu": self.live.gpu,
                },
                "recent_logs": list(self.lines),
            }


def _classify_exit_code(code: Optional[int]) -> Optional[str]:
    if code is None or code == 0:
        return None
    if code in {137, -9, 9}:
        return "signal_killed"
    if code in {-15, 15, -2, 2}:
        return "signal_terminated"
    return "process_error"


def _extract_failure_detail(lines: Deque[str]) -> Optional[str]:
    keywords = ("error", "exception", "traceback", "failed", "killed", "fatal")
    for line in reversed(lines):
        lower = line.lower()
        if any(keyword in lower for keyword in keywords):
            return line.strip()[:500]
    if lines:
        return str(lines[-1]).strip()[:500]
    return None


def _infer_failure_fields(run: "RunState") -> None:
    if run.status == "completed":
        run.failure_reason = None
        run.failure_detail = None
        return
    if run.failure_reason in FAILURE_REASONS:
        if run.failure_reason == "user_stopped" and run.status == "failed":
            run.status = "stopped"
        return

    err = (run.error or "").lower()
    if "stopped from dashboard" in err or "requested stop" in err:
        run.failure_reason = "user_stopped"
        run.status = "stopped"
        return
    if "interrupted by dashboard restart" in err:
        run.failure_reason = "dashboard_restart"
        return
    if run.status == "stopped":
        run.failure_reason = "user_stopped"
        return

    classified = _classify_exit_code(run.exit_code)
    run.failure_reason = classified or "unknown"


class SimulationManager:
    def __init__(self) -> None:
        self._runs: Dict[str, RunState] = {}
        self._current_run_id: Optional[str] = None
        self._proc_cpu_tracker: Dict[int, Tuple[float, float]] = {}
        self._manager_lock = threading.RLock()
        if psutil is not None:
            try:
                psutil.cpu_percent(interval=None)
                psutil.Process(os.getpid()).cpu_percent(interval=None)
            except Exception:
                pass
        self._load_persisted_runs()
        self._discover_runs_from_logs()

    def _serialize_run(self, run: RunState) -> Dict[str, Any]:
        return {
            "run_id": run.run_id,
            "params": run.params,
            "log_dir": run.log_dir,
            "status": run.status,
            "pid": run.pid,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "exit_code": run.exit_code,
            "error": run.error,
            "failure_reason": run.failure_reason,
            "failure_detail": run.failure_detail,
            "live": {
                "simulation_time": run.live.simulation_time,
                "messages_processed": run.live.messages_processed,
                "wallclock_elapsed": run.live.wallclock_elapsed,
                "progress_pct": run.live.progress_pct,
                "simulation_process": run.live.simulation_process,
                "api_process": run.live.api_process,
                "host_system": run.live.host_system,
                "gpu": run.live.gpu,
            },
        }

    def _persist_runs(self) -> None:
        with self._manager_lock:
            os.makedirs(os.path.dirname(RUN_HISTORY_PATH), exist_ok=True)
            payload = {
                "runs": [self._serialize_run(run) for run in self._runs.values()],
            }
            with open(RUN_HISTORY_PATH, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, sort_keys=True)

    def _load_persisted_runs(self) -> None:
        if not os.path.exists(RUN_HISTORY_PATH):
            return
        try:
            with open(RUN_HISTORY_PATH, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception:
            return

        for item in payload.get("runs", []):
            run = RunState(
                run_id=str(item.get("run_id", "")),
                params=item.get("params", {}),
                log_dir=str(item.get("log_dir", "")),
                status=str(item.get("status", "completed")),
                pid=item.get("pid"),
                started_at=str(item.get("started_at") or datetime.utcnow().isoformat() + "Z"),
                finished_at=item.get("finished_at"),
                exit_code=item.get("exit_code"),
                error=item.get("error"),
                failure_reason=item.get("failure_reason"),
                failure_detail=item.get("failure_detail"),
            )
            live = item.get("live", {})
            run.live = LiveProgress(
                simulation_time=live.get("simulation_time"),
                messages_processed=int(live.get("messages_processed", 0)),
                wallclock_elapsed=live.get("wallclock_elapsed"),
                progress_pct=float(live.get("progress_pct", 100.0)),
                simulation_process=live.get("simulation_process", {}),
                api_process=live.get("api_process", {}),
                host_system=live.get("host_system", {}),
                gpu=live.get("gpu", {}),
            )
            run.lines.clear()
            if run.run_id:
                if run.status in {"running", "stopping"}:
                    run.status = "failed"
                    run.failure_reason = "dashboard_restart"
                    run.error = "Run was interrupted by dashboard restart."
                    run.finished_at = run.finished_at or datetime.utcnow().isoformat() + "Z"
                    run.exit_code = run.exit_code if run.exit_code is not None else -1
                else:
                    _infer_failure_fields(run)
                self._runs[run.run_id] = run

        if self._runs:
            self._persist_runs()

    def _discover_runs_from_logs(self) -> None:
        if not os.path.isdir(LOG_ROOT):
            return

        for entry in os.listdir(LOG_ROOT):
            run_log_dir = os.path.join(LOG_ROOT, entry)
            manifest_path = os.path.join(run_log_dir, "scenario_manifest.json")
            if not os.path.isdir(run_log_dir) or not os.path.exists(manifest_path):
                continue
            if entry in self._runs:
                continue

            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
            except Exception:
                manifest = {}

            started_at = datetime.utcnow().isoformat() + "Z"
            run = RunState(
                run_id=entry,
                params={
                    "seed": manifest.get("seed"),
                    "households": manifest.get("households", 120),
                    "firms": manifest.get("firms", 15),
                    "months": manifest.get("months", 18),
                    "wake_hours": manifest.get("wake_hours", 24),
                    "automation_adoption_rate": manifest.get("automation_adoption_rate", 0.02),
                    "task_substitution_elasticity": manifest.get("task_substitution_elasticity", 0.30),
                    "productivity_gain_factor": manifest.get("productivity_gain_factor", 0.45),
                    "labor_displacement_lag": manifest.get("labor_displacement_lag", 3),
                    "income_tax_rate": manifest.get("income_tax_rate", 0.18),
                    "unemployment_support": manifest.get("unemployment_support", 9000),
                    "retraining_subsidy": manifest.get("retraining_subsidy", 0.03),
                    "neutral_rate": manifest.get("neutral_rate", 0.02),
                },
                log_dir=entry,
                status="completed",
                pid=None,
                started_at=started_at,
                finished_at=started_at,
                exit_code=0,
            )
            run.live.progress_pct = 100.0
            run.live.simulation_process = {}
            run.live.api_process = {}
            run.live.host_system = {}
            run.live.gpu = {}
            self._runs[run.run_id] = run

        self._persist_runs()

    def _collect_process_metrics(self, pid: Optional[int], started_at: Optional[str]) -> Dict[str, Any]:
        if psutil is None:
            return {"available": False, "reason": "psutil_not_installed"}
        if pid is None:
            return {"available": False, "reason": "pid_missing"}
        try:
            proc = psutil.Process(pid)
            now = time.time()
            cpu_times = proc.cpu_times()
            total_cpu_time = float(cpu_times.user + cpu_times.system)
            previous = self._proc_cpu_tracker.get(int(pid))
            self._proc_cpu_tracker[int(pid)] = (total_cpu_time, now)
            if previous:
                previous_total, previous_ts = previous
                elapsed = max(1e-6, now - previous_ts)
                cpu = max(0.0, (total_cpu_time - previous_total) * 100.0 / elapsed)
            else:
                cpu = proc.cpu_percent(interval=0.05)
            mem = proc.memory_info()
            threads = proc.num_threads()
            open_files = len(proc.open_files())
            status = proc.status()
            uptime_seconds = None
            if started_at:
                try:
                    start_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    uptime_seconds = max(0.0, (datetime.utcnow().replace(tzinfo=start_dt.tzinfo) - start_dt).total_seconds())
                except Exception:
                    uptime_seconds = None
            return {
                "available": True,
                "cpu_percent": float(cpu),
                "memory_rss_mb": float(mem.rss) / (1024.0 * 1024.0),
                "memory_vms_mb": float(mem.vms) / (1024.0 * 1024.0),
                "threads": int(threads),
                "open_files": int(open_files),
                "status": status,
                "uptime_seconds": uptime_seconds,
            }
        except Exception as exc:
            if pid is not None and int(pid) in self._proc_cpu_tracker:
                self._proc_cpu_tracker.pop(int(pid), None)
            return {"available": False, "reason": f"process_unavailable:{exc.__class__.__name__}"}

    def _collect_system_metrics(self) -> Dict[str, Any]:
        if psutil is None:
            return {"available": False, "reason": "psutil_not_installed"}
        try:
            vm = psutil.virtual_memory()
            return {
                "available": True,
                "cpu_percent": float(psutil.cpu_percent(interval=None)),
                "ram_percent": float(vm.percent),
                "ram_used_gb": float(vm.used) / (1024.0 * 1024.0 * 1024.0),
                "ram_total_gb": float(vm.total) / (1024.0 * 1024.0 * 1024.0),
            }
        except Exception as exc:
            return {"available": False, "reason": f"system_unavailable:{exc.__class__.__name__}"}

    def _collect_gpu_metrics(self, pid: Optional[int]) -> Dict[str, Any]:
        nvidia_smi = shutil.which("nvidia-smi")
        if not nvidia_smi:
            return {"available": False, "reason": "nvidia_smi_not_found"}
        try:
            gpu_out = subprocess.check_output(
                [
                    nvidia_smi,
                    "--query-gpu=utilization.gpu,memory.used,memory.total",
                    "--format=csv,noheader,nounits",
                ],
                text=True,
                timeout=1.5,
            ).strip()
            gpu_rows = [row.strip() for row in gpu_out.splitlines() if row.strip()]
            if not gpu_rows:
                return {"available": False, "reason": "no_gpu_rows"}

            parsed = []
            for row in gpu_rows:
                parts = [x.strip() for x in row.split(",")]
                if len(parts) < 3:
                    continue
                parsed.append(
                    {
                        "utilization_percent": float(parts[0]),
                        "memory_used_mb": float(parts[1]),
                        "memory_total_mb": float(parts[2]),
                    }
                )
            if not parsed:
                return {"available": False, "reason": "gpu_parse_failed"}

            process_memory_mb = None
            if pid is not None:
                try:
                    proc_out = subprocess.check_output(
                        [
                            nvidia_smi,
                            "--query-compute-apps=pid,used_memory",
                            "--format=csv,noheader,nounits",
                        ],
                        text=True,
                        timeout=1.5,
                    ).strip()
                    proc_rows = [row.strip() for row in proc_out.splitlines() if row.strip()]
                    total = 0.0
                    for row in proc_rows:
                        parts = [x.strip() for x in row.split(",")]
                        if len(parts) < 2:
                            continue
                        if int(parts[0]) == int(pid):
                            total += float(parts[1])
                    process_memory_mb = total
                except Exception:
                    process_memory_mb = None

            first = parsed[0]
            return {
                "available": True,
                "source": "nvidia-smi",
                "gpu_count": len(parsed),
                "utilization_percent": first["utilization_percent"],
                "memory_used_mb": first["memory_used_mb"],
                "memory_total_mb": first["memory_total_mb"],
                "process_memory_mb": process_memory_mb,
            }
        except Exception as exc:
            return {"available": False, "reason": f"gpu_query_failed:{exc.__class__.__name__}"}

    def _refresh_live_metrics(self, run: RunState) -> None:
        with run.lock:
            run.live.simulation_process = self._collect_process_metrics(run.pid, run.started_at)
            run.live.api_process = self._collect_process_metrics(os.getpid(), None)
            run.live.host_system = self._collect_system_metrics()
            run.live.gpu = self._collect_gpu_metrics(run.pid)

    def get_monitor_snapshot(self) -> Dict[str, Any]:
        with self._manager_lock:
            active_run = self._runs[self._current_run_id] if self._current_run_id else None
        snapshot = {
            "host_system": self._collect_system_metrics(),
            "api_process": self._collect_process_metrics(os.getpid(), None),
            "gpu": self._collect_gpu_metrics(active_run.pid if active_run else None),
            "current_run_id": active_run.run_id if active_run else None,
        }
        return snapshot

    def _clear_current_run_if(self, run_id: str) -> None:
        with self._manager_lock:
            if self._current_run_id == run_id:
                self._current_run_id = None

    def _terminate_process(self, process: subprocess.Popen, timeout_s: float = 8.0) -> int:
        if process.poll() is not None:
            return int(process.returncode or 0)
        process.terminate()
        try:
            return int(process.wait(timeout=timeout_s))
        except subprocess.TimeoutExpired:
            process.kill()
            try:
                return int(process.wait(timeout=5))
            except subprocess.TimeoutExpired:
                return -1

    def _derive_progress_pct(self, months: int, simulation_time: str) -> float:
        try:
            current = pd.Timestamp(simulation_time.strip())
            stop = SIMULATION_START + pd.to_timedelta(f"{max(1, months * 30)} days")
            total_seconds = max(1.0, (stop - SIMULATION_START).total_seconds())
            elapsed_seconds = max(0.0, (current - SIMULATION_START).total_seconds())
            return min(100.0, (elapsed_seconds / total_seconds) * 100.0)
        except Exception:
            return 0.0

    def _reader_thread(self, run: RunState) -> None:
        assert run.process is not None and run.process.stdout is not None
        proc = run.process

        for raw_line in iter(proc.stdout.readline, ""):
            line = raw_line.rstrip("\n")
            with run.lock:
                run.lines.append(line)
                match = PROGRESS_RE.search(line.strip())
                if match:
                    sim_time = match.group(1).strip()
                    run.live.simulation_time = sim_time
                    run.live.messages_processed = int(match.group(2))
                    run.live.wallclock_elapsed = match.group(3).strip()
                    run.live.progress_pct = self._derive_progress_pct(
                        months=int(run.params.get("months", 18)),
                        simulation_time=sim_time,
                    )

        code = proc.poll()
        if code is None:
            code = self._terminate_process(proc)

        with run.lock:
            if run.finished_at is None:
                run.exit_code = code
                run.finished_at = datetime.utcnow().isoformat() + "Z"
                if run.status in {"stopping", "stopped"} or run.failure_reason == "user_stopped":
                    run.status = "stopped"
                    run.failure_reason = "user_stopped"
                    run.error = run.error or "Simulation stopped from dashboard."
                elif code == 0:
                    run.status = "completed"
                    run.failure_reason = None
                    run.failure_detail = None
                    run.live.progress_pct = 100.0
                else:
                    run.status = "failed"
                    run.failure_reason = _classify_exit_code(code) or "process_error"
                    run.failure_detail = _extract_failure_detail(run.lines)
                    run.error = run.error or f"Simulation exited with code {code}."
            run.process = None

        self._clear_current_run_if(run.run_id)
        self._persist_runs()

    def start(self, request: StartSimulationRequest) -> Dict[str, Any]:
        with self._manager_lock:
            if self._current_run_id:
                current = self._runs[self._current_run_id]
                if current.status in {"running", "stopping"}:
                    raise HTTPException(status_code=409, detail="A simulation is already running.")

            now = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            run_id = f"run-{now}"
            log_dir = request.log_dir or run_id
            params = request.params.model_dump()
            seed = params.get("seed")
            if seed is None:
                seed = int(time.time() * 1_000_000) % (2**32 - 1)
                params["seed"] = seed

            command = [
                sys.executable,
                "-u",
                "abides.py",
                "-c",
                "baseline",
                "-l",
                log_dir,
                "-s",
                str(seed),
                "--households",
                str(params["households"]),
                "--firms",
                str(params["firms"]),
                "--months",
                str(params["months"]),
                "--wake_hours",
                str(params["wake_hours"]),
                "--automation_adoption_rate",
                str(params["automation_adoption_rate"]),
                "--task_substitution_elasticity",
                str(params["task_substitution_elasticity"]),
                "--productivity_gain_factor",
                str(params["productivity_gain_factor"]),
                "--labor_displacement_lag",
                str(params["labor_displacement_lag"]),
                "--income_tax_rate",
                str(params["income_tax_rate"]),
                "--unemployment_support",
                str(params["unemployment_support"]),
                "--retraining_subsidy",
                str(params["retraining_subsidy"]),
                "--neutral_rate",
                str(params["neutral_rate"]),
            ]
            if request.verbose:
                command.append("--verbose")

            run_env = os.environ.copy()
            if request.telemetry_sample_n > 0:
                run_env["ABIDES_TELEMETRY_N"] = str(int(request.telemetry_sample_n))

            process = subprocess.Popen(
                command,
                cwd=REPO_ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=run_env,
            )

            run = RunState(run_id=run_id, params=params, log_dir=log_dir, process=process, pid=process.pid)
            if psutil is not None:
                try:
                    psutil.Process(process.pid).cpu_percent(interval=None)
                except Exception:
                    pass
            self._runs[run_id] = run
            self._current_run_id = run_id
            self._persist_runs()

            t = threading.Thread(target=self._reader_thread, args=(run,), daemon=True)
            t.start()

            return run.as_dict()

    def get_current(self) -> Optional[Dict[str, Any]]:
        with self._manager_lock:
            if not self._current_run_id:
                return None
            run = self._runs[self._current_run_id]
            if run.status not in {"running", "stopping"}:
                self._current_run_id = None
                return None
        self._refresh_live_metrics(run)
        return run.as_dict()

    def get_current_run_meta(self) -> Optional[Dict[str, str]]:
        with self._manager_lock:
            if not self._current_run_id:
                return None
            run = self._runs[self._current_run_id]
            return {"run_id": run.run_id, "log_dir": run.log_dir}

    def stop_current(self) -> Dict[str, Any]:
        with self._manager_lock:
            if not self._current_run_id:
                raise HTTPException(status_code=404, detail="No active simulation run.")
            run = self._runs[self._current_run_id]

        process: Optional[subprocess.Popen] = None
        with run.lock:
            if run.process is None or run.status not in {"running", "stopping"}:
                raise HTTPException(status_code=409, detail="Run is not active.")
            process = run.process
            run.status = "stopping"
            run.failure_reason = "user_stopped"
            run.error = "Simulation stopped from dashboard."
            run.lines.append("Requested stop from dashboard.")

        exit_code = self._terminate_process(process) if process is not None else -15

        with run.lock:
            run.exit_code = exit_code
            run.finished_at = datetime.utcnow().isoformat() + "Z"
            run.status = "stopped"
            run.failure_reason = "user_stopped"
            run.process = None
            run.pid = None

        self._clear_current_run_if(run.run_id)
        self._persist_runs()
        return run.as_dict()

    def list_runs(self) -> List[Dict[str, Any]]:
        self._discover_runs_from_logs()
        with self._manager_lock:
            runs = list(self._runs.values())
        runs.sort(key=lambda r: r.started_at, reverse=True)
        return [r.as_dict() for r in runs]

    def get_run(self, run_id: str) -> Dict[str, Any]:
        with self._manager_lock:
            if run_id not in self._runs:
                raise HTTPException(status_code=404, detail="Run not found.")
            run = self._runs[run_id]
        if run.status in {"running", "stopping"}:
            self._refresh_live_metrics(run)
        return run.as_dict()


def _parse_summary_event(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _build_stats(log_dir: str) -> Dict[str, Any]:
    summary_path = os.path.join(log_dir, "summary_log.bz2")
    if not os.path.exists(summary_path):
        raise HTTPException(status_code=404, detail=f"Missing summary log in {log_dir}.")

    summary = pd.read_pickle(summary_path, compression="bz2")

    households = summary[summary["EventType"] == "HOUSEHOLD_FINAL_STATE"]["Event"].apply(_parse_summary_event)
    firms = summary[summary["EventType"] == "FIRM_FINAL_STATE"]["Event"].apply(_parse_summary_event)
    banks = summary[summary["EventType"] == "BANK_FINAL_STATE"]["Event"].apply(_parse_summary_event)
    governments = summary[summary["EventType"] == "GOVERNMENT_FINAL_STATE"]["Event"].apply(_parse_summary_event)
    rates = summary[summary["EventType"] == "POLICY_RATE_SET"]["Event"].apply(_parse_summary_event)

    household_rows = [x for x in households if x]
    firm_rows = [x for x in firms if x]
    bank_rows = [x for x in banks if x]
    gov_rows = [x for x in governments if x]
    rate_rows = [x for x in rates if x]

    total_households = len(household_rows)
    unemployed = sum(1 for x in household_rows if x.get("is_unemployed", False))

    stats: Dict[str, Any] = {
        "households": total_households,
        "unemployed_households": unemployed,
        "unemployment_rate": (unemployed / float(total_households)) if total_households else 0.0,
        "average_household_cash_cents": int(
            sum(x.get("cash_cents", 0) for x in household_rows) / float(max(1, total_households))
        ),
        "total_firm_cash_cents": int(sum(x.get("cash_cents", 0) for x in firm_rows)),
        "average_firm_automation_level": (
            sum(x.get("automation_level", 0.0) for x in firm_rows) / float(max(1, len(firm_rows)))
        ),
        "active_loans_count": int(sum(x.get("active_loans", 0) for x in bank_rows)),
        "government_budget_cents": int(gov_rows[-1].get("budget_cents", 0) if gov_rows else 0),
        "final_policy_rate": float(rate_rows[-1].get("policy_rate", 0.0) if rate_rows else 0.0),
    }

    manifest_path = os.path.join(log_dir, "scenario_manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            stats["scenario_manifest"] = json.load(f)

    return stats


def _build_timeseries(log_dir: str) -> List[Dict[str, Any]]:
    TRACKED_EVENTS = {
        "WAGE_PAYMENT_RECEIVED": "wages_paid_cents",
        "GOODS_CONSUMED": "consumption_spend_cents",
        "TRANSFER_RECEIVED": "transfers_cents",
        "PRODUCTION": "production_units",
    }

    rows: List[Dict[str, Any]] = []

    for filename in os.listdir(log_dir):
        if not filename.endswith(".bz2"):
            continue
        if filename.startswith("summary_log") or filename.startswith("ORDERBOOK_"):
            continue

        path = os.path.join(log_dir, filename)
        df = pd.read_pickle(path, compression="bz2")
        if "EventType" not in df.columns or "Event" not in df.columns:
            continue

        tracked = df[df["EventType"].isin(TRACKED_EVENTS.keys())]
        for ts, row in tracked.iterrows():
            event_type = row["EventType"]
            payload = row["Event"] if isinstance(row["Event"], dict) else {}
            if event_type == "TRANSFER_RECEIVED" and not isinstance(row["Event"], dict):
                payload = {"amount_cents": row["Event"]}

            if event_type == "WAGE_PAYMENT_RECEIVED":
                value = int(payload.get("gross_cents", 0))
            elif event_type == "GOODS_CONSUMED":
                value = int(payload.get("spent_cents", 0))
            elif event_type == "TRANSFER_RECEIVED":
                value = int(payload.get("amount_cents", 0))
            elif event_type == "PRODUCTION":
                value = int(payload.get("produced", 0))
            else:
                value = 0

            rows.append({"timestamp": ts, "series": TRACKED_EVENTS[event_type], "value": value})

    if not rows:
        return []

    out = pd.DataFrame(rows)
    out = out.groupby(["timestamp", "series"], as_index=False)["value"].sum()
    pivot = out.pivot(index="timestamp", columns="series", values="value").fillna(0).sort_index()
    pivot.reset_index(inplace=True)
    pivot["timestamp"] = pivot["timestamp"].astype(str)

    return pivot.to_dict(orient="records")


def _read_telemetry_tail(log_dir: str, limit: int = 800) -> List[Dict[str, Any]]:
    path = os.path.join(LOG_ROOT, log_dir, "telemetry.jsonl")
    if not os.path.exists(path):
        return []
    rows: Deque[str] = deque(maxlen=max(1, limit))
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    rows.append(line)
    except OSError:
        return []
    out: List[Dict[str, Any]] = []
    for line in rows:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


manager = SimulationManager()
app = FastAPI(title="ABIDES Dashboard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/runs")
def list_runs() -> Dict[str, Any]:
    return {"runs": manager.list_runs()}


@app.get("/api/runs/current")
def current_run() -> Dict[str, Any]:
    run = manager.get_current()
    if not run:
        return {"run": None}
    return {"run": run}


@app.get("/api/monitor")
def monitor() -> Dict[str, Any]:
    return manager.get_monitor_snapshot()


@app.get("/api/runs/current/telemetry")
def current_run_telemetry(limit: int = 800) -> Dict[str, Any]:
    meta = manager.get_current_run_meta()
    if not meta:
        return {"run_id": None, "log_dir": None, "events": []}
    events = _read_telemetry_tail(meta["log_dir"], limit=limit)
    return {"run_id": meta["run_id"], "log_dir": meta["log_dir"], "events": events}


@app.get("/api/runs/{run_id}/telemetry")
def run_telemetry(run_id: str, limit: int = 800) -> Dict[str, Any]:
    run = manager.get_run(run_id)
    events = _read_telemetry_tail(run["log_dir"], limit=limit)
    return {"run_id": run_id, "log_dir": run["log_dir"], "events": events}


@app.post("/api/runs")
def start_run(request: StartSimulationRequest) -> Dict[str, Any]:
    run = manager.start(request)
    return {"run": run}


@app.post("/api/runs/current/stop")
def stop_run() -> Dict[str, Any]:
    run = manager.stop_current()
    return {"run": run}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> Dict[str, Any]:
    return {"run": manager.get_run(run_id)}


@app.get("/api/runs/{run_id}/results")
def get_run_results(run_id: str) -> Dict[str, Any]:
    run = manager.get_run(run_id)
    run_log_dir = os.path.join(LOG_ROOT, run["log_dir"])
    if not os.path.exists(run_log_dir):
        raise HTTPException(status_code=404, detail=f"Log directory does not exist: {run_log_dir}")

    return {
        "run_id": run_id,
        "log_dir": run["log_dir"],
        "stats": _build_stats(run_log_dir),
        "timeseries": _build_timeseries(run_log_dir),
    }
