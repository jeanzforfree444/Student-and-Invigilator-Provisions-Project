#!/bin/sh
set -eu


# If you add a startup script at /app/bin/start.sh, we run it.
if [ -x /app/bin/start.sh ]; then
    exec /app/bin/start.sh "$@"
fi


# Otherwise, print a helpful message and sleep forever (container stays healthy/idle)
echo "[app-skeleton] No /app/bin/start.sh found. Container is ready for your app code."
exec sleep infinity