#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/dashboard/web"
API_HOST="127.0.0.1"
API_PORT="8000"
WEB_PORT="5173"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but was not found."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found."
  echo "Install Node.js + npm, then run this command again."
  exit 1
fi

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  echo "Frontend dependencies not found. Installing with npm..."
  (cd "$WEB_DIR" && npm install)
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

(cd "$ROOT_DIR" && python3 -m uvicorn dashboard.server:app --host "$API_HOST" --port "$API_PORT") &
API_PID=$!

echo "Starting Olympus dashboard API (powered by ABIDES) on http://$API_HOST:$API_PORT ..."

sleep 1
if ! kill -0 "$API_PID" >/dev/null 2>&1; then
  echo "Failed to start backend API."
  exit 1
fi

(cd "$ROOT_DIR" && sleep 0) # ensure API start initiated
echo "Starting Olympus web UI (dashboard) on http://$API_HOST:$WEB_PORT ..."
(cd "$WEB_DIR" && npm run dev -- --host "$API_HOST" --port "$WEB_PORT") &
WEB_PID=$!

sleep 1
if ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
  echo "Failed to start frontend UI."
  exit 1
fi

echo
echo "Dashboard is running:"
echo "  UI:  http://$API_HOST:$WEB_PORT"
echo "  API: http://$API_HOST:$API_PORT"
echo "Press Ctrl+C to stop both services."
echo

wait "$API_PID" "$WEB_PID"
