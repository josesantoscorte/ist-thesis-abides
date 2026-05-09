# ABIDES Dashboard

Modern web dashboard for configuring, running, monitoring, and analyzing simulation runs.

## 1) Install backend dependencies

```bash
python3 -m pip install -r requirements.txt
```

## 2) Install frontend dependencies

```bash
cd dashboard/web
npm install
```

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

## Capabilities

- Define all baseline simulation parameters from the dashboard.
- Start/stop simulation runs.
- Monitor run status and live runtime progress from simulation stdout.
- View final results with KPI cards and time-series charts.
