#!/bin/bash
# MeshGuild Collector Runner
# Auto-restarts the collector when it exits with code 42 (ops reboot command).
# Usage: ./collector/run.sh

cd "$(dirname "$0")/.."

echo "[runner] Starting MeshGuild collector..."
echo "[runner] Press Ctrl+C to stop"

while true; do
  python3 -u -m collector.main
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 42 ]; then
    echo "[runner] Collector requested restart (exit 42). Restarting in 3s..."
    sleep 3
  elif [ $EXIT_CODE -eq 130 ] || [ $EXIT_CODE -eq 143 ]; then
    echo "[runner] Collector stopped by signal. Exiting."
    exit 0
  else
    echo "[runner] Collector exited with code $EXIT_CODE. Restarting in 10s..."
    sleep 10
  fi
done
