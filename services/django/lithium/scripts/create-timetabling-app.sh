#!/usr/bin/env bash

# Bootstrap the `timetabling_system` Django app from inside the Django container.
# Usage (from repo root): docker compose -f ops/compose/docker-compose.dev.yml exec django bash scripts/create-timetabling-app.sh

set -euo pipefail

APP_NAME="timetabling_system"
APP_PATH="/app/${APP_NAME}"

cd /app

if [[ -d "${APP_PATH}" ]]; then
    echo "Django app '${APP_NAME}' already exists at ${APP_PATH}"
    exit 0
fi

python manage.py startapp "${APP_NAME}"

echo "Created Django app '${APP_NAME}' in ${APP_PATH}"
