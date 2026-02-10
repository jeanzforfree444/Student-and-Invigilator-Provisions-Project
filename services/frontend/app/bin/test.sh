#!/bin/sh
set -eu

if command -v npm >/dev/null 2>&1 && [ -f /app/package.json ]; then
    echo "[app-skeleton] package.json detected."

    if [ ! -d /app/node_modules ]; then
        echo "[app-skeleton] Installing node dependencies..."
        if [ -f /app/package-lock.json ]; then
            npm ci
        else
            npm install --include=dev
        fi
    fi

    test_script="$(npm pkg get scripts.test 2>/dev/null || echo null)"
    if [ "$test_script" != "null" ]; then
        echo "[app-skeleton] Running npm test script."
        npm test -- "$@"
        exit $?
    else
        echo "[app-skeleton] package.json has no test script defined. Skipping."
        exit 0
    fi
fi

echo "[app-skeleton] No package.json found. Skipping tests."
