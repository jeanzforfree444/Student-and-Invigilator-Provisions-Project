#!/usr/bin/env bash
set -euo pipefail

# Reset dev containers, rebuild images, and run service tests inside the stack.
# Future services (e.g. database) can be added to the SERVICE_LIST array.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/ops/compose/docker-compose.dev.yml"
SERVICE_LIST=("frontend" "django")

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed or not on PATH" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is required but not available" >&2
  exit 1
fi

run_compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

echo ">>> Stopping existing containers and clearing volumes"
make -C "$REPO_ROOT" down

echo ">>> Removing any lingering containers for a clean slate"
run_compose rm -fsv >/dev/null 2>&1 || true

echo ">>> Building fresh service images"
make -C "$REPO_ROOT" build

echo ">>> Starting the dev stack"
make -C "$REPO_ROOT" up

for service in "${SERVICE_LIST[@]}"; do
  if ! run_compose ps --services | grep -qx "$service"; then
    echo ">>> Skipping $service (not defined in compose file yet)"
    continue
  fi

  case "$service" in
    frontend
      echo ">>> ($service) Installing dependencies"
      run_compose exec -T "$service" sh -lc 'if [ -f package-lock.json ]; then npm ci; else npm install; fi'

      echo ">>> ($service) Running test suite"
      run_compose exec -T "$service" sh -lc "npm test"
      ;;
    django)
      echo ">>> ($service) Syncing Python dependencies"
      run_compose exec -T "$service" sh -lc 'if command -v uv >/dev/null 2>&1; then uv sync --frozen || uv sync; elif [ -f requirements.txt ]; then pip install -r requirements.txt; fi'

      echo ">>> ($service) Applying database migrations"
      run_compose exec -T "$service" sh -lc 'if command -v uv >/dev/null 2>&1; then uv run python manage.py migrate; else python manage.py migrate; fi'

      echo ">>> ($service) Running test suite"
      run_compose exec -T "$service" sh -lc 'if command -v uv >/dev/null 2>&1; then uv run python manage.py test; else python manage.py test; fi'
      ;;
    *)
      echo ">>> ($service) No refresh commands configured"
      ;;
  esac
done

echo "All services refreshed and tests executed. Follow logs with:"
echo "  docker compose -f ops/compose/docker-compose.dev.yml logs -f"
