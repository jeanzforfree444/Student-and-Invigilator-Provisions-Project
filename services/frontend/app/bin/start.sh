#!/bin/sh
set -eu

cd /app

if [ ! -f package.json ]; then
    echo "[frontend] No package.json found. Container is idle."
    exec sleep infinity
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "[frontend] npm is not available in the container."
    exec sleep infinity
fi

# Install dependencies when node_modules is missing or Vite isn't available.
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
    echo "[frontend] Installing dependencies..."
    if [ -f package-lock.json ]; then
        npm ci
    else
        npm install
    fi
fi

echo "[frontend] Starting Vite dev server..."
# Ignore any passed arguments (the base image CMD defaults to "idle").
exec npm run start
