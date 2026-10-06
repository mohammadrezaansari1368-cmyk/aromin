#!/usr/bin/env bash
set -euo pipefail
cd /workspace/aromin
base=/workspace/aromin-tools
export LD_LIBRARY_PATH="$base/dbroot/usr/lib/x86_64-linux-gnu"
if ! "$base/dbroot/usr/bin/mariadb-admin" --no-defaults --socket="$base/mariadb.sock" -u root ping >/dev/null 2>&1; then
  nohup "$base/dbroot/usr/sbin/mariadbd" --no-defaults --basedir="$base/dbroot/usr" --datadir="$base/data" --socket="$base/mariadb.sock" --pid-file="$base/mariadb.pid" --bind-address=127.0.0.1 --port=3307 --log-error="$base/mariadb.log" > "$base/db-start.log" 2>&1 &
fi
for attempt in {1..30}; do
  if "$base/dbroot/usr/bin/mariadb-admin" --no-defaults --socket="$base/mariadb.sock" -u root ping >/dev/null 2>&1; then break; fi
  sleep 1
done
export DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASS='' DB_NAME=aromin_dev
export HTML_FILE=/workspace/aromin/deployment/legacy.html SPA_DIR=/workspace/aromin/frontend/dist
if ! curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  (cd deployment && nohup /workspace/aromin-venv/bin/uvicorn server:app --host 127.0.0.1 --port 3000 > "$base/api.log" 2>&1 &)
fi
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/legacy -o /dev/null
