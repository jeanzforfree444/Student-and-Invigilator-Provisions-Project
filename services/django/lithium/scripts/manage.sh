#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PYTHON="$VENV_DIR/bin/python"
LOCK_FILE="$PROJECT_ROOT/uv.lock"
PYPROJECT_FILE="$PROJECT_ROOT/pyproject.toml"
MARKER_FILE="$VENV_DIR/.deps-installed"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Interpreter '$PYTHON_BIN' not found" >&2
    exit 1
fi

if [ ! -x "$PYTHON" ]; then
    echo "Virtualenv missing or invalid; rebuilding at $VENV_DIR..."
    if ! rm -rf "$VENV_DIR"; then
        cat >&2 <<EOF
Failed to remove the existing virtualenv at $VENV_DIR (likely owned by root from a container run).
Please delete it manually, e.g.:
  sudo rm -rf $VENV_DIR
Then re-run: $0 "$@"
EOF
        exit 1
    fi
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if [ ! -f "$MARKER_FILE" ] || \
   { [ -f "$LOCK_FILE" ] && [ "$LOCK_FILE" -nt "$MARKER_FILE" ]; } || \
   { [ -f "$PYPROJECT_FILE" ] && [ "$PYPROJECT_FILE" -nt "$MARKER_FILE" ]; }; then
    "$PYTHON" -m pip install --upgrade pip
    "$PYTHON" -m pip install -e "$PROJECT_ROOT"
    touch "$MARKER_FILE"
fi

cd "$PROJECT_ROOT"
exec "$PYTHON" manage.py "$@"
