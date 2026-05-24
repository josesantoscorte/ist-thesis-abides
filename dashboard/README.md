# Olympus — ABIDES Dashboard

Olympus is a modern web dashboard built on top of the ABIDES simulation framework. It provides a friendly UI
for configuring, running, monitoring, and analyzing simulation runs while keeping the underlying ABIDES
project as the simulation engine.

## 1) Install backend dependencies

```bash
python3 -m pip install -r requirements.txt
```

## 2) Install frontend dependencies

```bash
cd dashboard/web
npm install
```

Icons use [Lucide](https://lucide.dev/icons) via `lucide-react` (minimal stroke set). To swap an icon, edit `dashboard/web/src/ui/icons.tsx` and pick any name from the Lucide catalog.

## 3) Launch as a single application (recommended)

From repo root:

```bash
./scripts/dashboard.sh
```

This starts backend + frontend together and manages them as one process lifecycle.

## 4) Manual mode (optional)

If you want to run each service independently:

Backend:

```bash
uvicorn dashboard.server:app --reload --port 8000
```

Frontend:

```bash
cd dashboard/web
npm run dev
```

Open `http://127.0.0.1:5173`.

## Kernel telemetry (live graph)

When you start a simulation from the dashboard, the API sets `ABIDES_TELEMETRY_N` from `telemetry_sample_n` on the start request (default **80**: one recorded `sendMessage` per 80 kernel enqueues). Each sample is appended as JSON to `log/<log_dir>/telemetry.jsonl` with numeric agent ids, `sender_type`, `recipient_type`, `family`, and `msg`. Lines are **flushed immediately** so the dashboard can read them while the run is in progress.

The monitor polls `GET /api/runs/{run_id}/telemetry` and draws **one node per agent** (matching the baseline config registration order), coloring directed edges between sampled sender/recipient pairs by dominant message family. Node positions use a **hybrid force-directed layout** ([d3-force](https://github.com/d3/d3-force)) computed **once from simulation parameters** (structural baseline graph — positions do not change during a run). Gov/CB/Bank are pinned; firms and households spread with link forces, repulsion, and collision, then the layout is scaled to fill the panel. **Scroll/trackpad to zoom**, **drag to pan**, **Reset view**, or **Fullscreen** (graph panel only). Edge colors still follow live telemetry. Set `telemetry_sample_n` to **0** in the API payload to disable sampling and disk output.

## Capabilities

- Define all baseline simulation parameters from the dashboard.
- Start/stop simulation runs.
- Monitor run status and live runtime progress from simulation stdout.
- View final results with KPI cards and time-series charts.
