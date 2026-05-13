#!/bin/bash
# Note: No 'set -e' - watchdog needs to continue on errors

cd /app

# Node.js memory limit: 1.5GB max heap (leaves 512MB for OS/other processes)
export NODE_OPTIONS="--max-old-space-size=1536"

# Watchdog: restart Next.js dev server if it crashes
while true; do
  echo "[watchdog] Starting Next.js dev server..."
  npm run dev -- -H 0.0.0.0 2>&1 | tee -a /tmp/nextjs.log || true

  echo "[watchdog] Dev server exited, waiting 2s before restart..."
  sleep 2
done
