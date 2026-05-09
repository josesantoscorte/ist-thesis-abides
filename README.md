# Macro Economy Simulation Core

This repository is a stripped-down, macro-economy simulation framework built on an event-driven kernel.

The codebase is intentionally minimal:

- `abides.py` - entrypoint
- `Kernel.py` - event queue and simulation lifecycle
- `message/Message.py` - message/event types
- `agent/Agent.py` - base agent abstraction
- `agent/` - agents (households, firms, bank, government, central bank)
- `model/` - behavior functions (labor, production, credit)
- `policy/` - fiscal, monetary, and automation policy hooks
- `config/baseline.py` - default scenario
- `cli/stats.py` and `cli/timeseries.py` - analysis tools

## Install

```bash
python3 -m pip install -r requirements.txt
```

## Run the baseline simulation

```bash
python3 -u abides.py -c baseline -l baseline -s 123
```

or

```bash
./scripts/run.sh
```

## Analyze outputs

```bash
python3 -u cli/stats.py -l log/baseline
python3 -u cli/timeseries.py -l log/baseline
```

Each run also writes `scenario_manifest.json` to its log directory for reproducibility.

## Dashboard UI

A modern web dashboard is available under `dashboard/` with:

- simulation parameter configuration,
- run controls (start/stop),
- live progress monitoring,
- KPI and chart-based results.

See `dashboard/README.md` for setup/run instructions.

Quick start from repository root:

```bash
./scripts/dashboard.sh
```

## Notes

- The project is now macro-only.
- Legacy market simulation modules were removed to keep scope and maintenance cost low.
- Architecture boundaries are documented in `CORE_RUNTIME_BOUNDARY.md`.


