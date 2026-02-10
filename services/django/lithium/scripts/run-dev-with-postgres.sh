#!/usr/bin/env bash
set -euo pipefail

HOST_UID=${HOST_UID:-1000}
HOST_GID=${HOST_GID:-1000}

# Ensure postgres binaries are on PATH (Debian packages install under /usr/lib/postgresql/<ver>/bin)
if command -v pg_config >/dev/null 2>&1; then
  export PATH="$(pg_config --bindir):$PATH"
fi

# Ensure the host user's UID/GID exist inside the container so postgres tooling can resolve names
if ! getent group "$HOST_GID" >/dev/null 2>&1; then
  groupadd -g "$HOST_GID" hostgroup
fi
DEV_GROUP=$(getent group "$HOST_GID" | cut -d: -f1)

if ! getent passwd "$HOST_UID" >/dev/null 2>&1; then
  useradd -l -M -d /app -u "$HOST_UID" -g "$DEV_GROUP" hostuser
fi
DEV_USER=$(getent passwd "$HOST_UID" | cut -d: -f1)

run_as_dev() {
  gosu "$DEV_USER" "$@"
}

POSTGRES_DIR=${DJANGO_POSTGRES_DATA:-/app/.postgres-data}
POSTGRES_PORT=${DJANGO_DB_PORT:-5432}
DB_HOST=${DJANGO_DB_HOST:-127.0.0.1}
DB_SUPERUSER=${DJANGO_DB_USER:-postgres}
DB_NAME=${DJANGO_DB_NAME:-postgres}

mkdir -p "$POSTGRES_DIR"
chown "$HOST_UID:$HOST_GID" "$POSTGRES_DIR"
chmod 750 "$POSTGRES_DIR"  # Postgres requires 0700/0750 on data dir
mkdir -p /var/run/postgresql
chown "$HOST_UID:$HOST_GID" /var/run/postgresql
chmod 775 /var/run/postgresql

if [ ! -f "$POSTGRES_DIR/PG_VERSION" ]; then
  run_as_dev initdb -D "$POSTGRES_DIR" -U "$DB_SUPERUSER"
  {
    echo "listen_addresses = 'localhost'"
    echo "port = $POSTGRES_PORT"
  } >> "$POSTGRES_DIR/postgresql.conf"
  cat > "$POSTGRES_DIR/pg_hba.conf" <<EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF
fi

export PGHOST=$DB_HOST
export PGPORT=$POSTGRES_PORT
export PGUSER=$DB_SUPERUSER

run_as_dev pg_ctl -D "$POSTGRES_DIR" -w start

cleanup() {
  if [ -n "${RUNSERVER_PID:-}" ] && kill -0 "$RUNSERVER_PID" >/dev/null 2>&1; then
    kill "$RUNSERVER_PID"
    wait "$RUNSERVER_PID" || true
  fi

  run_as_dev pg_ctl -D "$POSTGRES_DIR" -m fast stop
}
trap cleanup EXIT INT TERM

if ! run_as_dev psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  run_as_dev createdb "$DB_NAME"
fi

VENV_DIR=/app/.venv

# Ensure the volume backing the venv is writable by the dev user; otherwise pip falls back to --user.
mkdir -p "$VENV_DIR"
chown -R "$HOST_UID:$HOST_GID" "$VENV_DIR"
if [ ! -x "$VENV_DIR/bin/python" ]; then
  run_as_dev python -m venv "$VENV_DIR"
fi
run_as_dev "$VENV_DIR/bin/python" -m ensurepip --upgrade

run_in_venv() {
  run_as_dev env VIRTUAL_ENV="$VENV_DIR" PATH="$VENV_DIR/bin:$PATH" "$@"
}

run_in_venv python -m pip install --no-input --upgrade pip
run_in_venv python -m pip install --no-input -r requirements.txt
run_in_venv python manage.py makemigrations --noinput
run_in_venv python manage.py migrate --noinput
run_in_venv python manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='test1').update(is_senior_admin=True)"

run_in_venv python manage.py runserver 0.0.0.0:8000 &
RUNSERVER_PID=$!
wait "$RUNSERVER_PID"
