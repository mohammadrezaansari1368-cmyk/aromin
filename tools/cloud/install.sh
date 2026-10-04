#!/usr/bin/env bash
set -euo pipefail
cd /workspace/aromin
python -m venv /workspace/aromin-venv
/workspace/aromin-venv/bin/pip install --cache-dir /workspace/pip-cache -r tools/cloud/requirements.lock
(cd frontend && npm ci --cache /workspace/npm-cache --no-audit --no-fund)
base=/workspace/aromin-tools
mkdir -p "$base/apt/lists/partial" "$base/apt/cache/archives/partial" "$base/debs" "$base/dbroot"
if [ ! -x "$base/dbroot/usr/sbin/mariadbd" ]; then
  cat > "$base/apt/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
SOURCES
  cat > "$base/apt/config" <<'CONFIG'
Dir::Etc::Parts "-";
Dir::Etc::main "-";
Dir::Etc::sourcelist "/workspace/aromin-tools/apt/sources.list";
Dir::Etc::sourceparts "-";
Dir::State::lists "/workspace/aromin-tools/apt/lists";
Dir::Cache "/workspace/aromin-tools/apt/cache";
APT::Sandbox::User "agent";
CONFIG
  APT_CONFIG="$base/apt/config" /usr/bin/apt-get update
  (cd "$base/debs" && APT_CONFIG="$base/apt/config" /usr/bin/apt-get download mariadb-server-core mariadb-client-core mariadb-server mariadb-client liburing2 libaio1t64 libnuma1 libpcre2-8-0 liblz4-1 libsnappy1v5 libzstd1 liblzo2-2)
  for archive in "$base"/debs/*.deb; do dpkg-deb -x "$archive" "$base/dbroot"; done
fi
if [ ! -d "$base/data/mysql" ]; then
  LD_LIBRARY_PATH="$base/dbroot/usr/lib/x86_64-linux-gnu" "$base/dbroot/usr/bin/mariadb-install-db" --no-defaults --basedir="$base/dbroot/usr" --datadir="$base/data" --auth-root-authentication-method=normal --skip-test-db
fi

(cd frontend && npm run build)
