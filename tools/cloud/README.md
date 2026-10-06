Use the existing /workspace/aromin checkout. Each cloud task is already isolated; do not create a worktree unless explicitly requested.

`bash tools/cloud/install.sh` installs locked frontend and local Python dependencies plus a signature-verified Debian MariaDB distribution under /workspace. Development data is local, disposable, and separate from production. No production credentials are required. Retain /workspace/aromin-tools, /workspace/aromin-venv, and frontend/node_modules in the prepared snapshot.

`bash tools/cloud/start.sh` restarts the local database on 127.0.0.1:3307 and API on 127.0.0.1:3000. Processes do not survive snapshots. For live frontend development run `npm run dev` in frontend; its API proxy targets this local server. Never point tests at the production dashboard.

Checks from frontend: `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`. A pre-existing optional test needs a private Excel fixture and remains skipped. The development Motion library prints its own reduced-motion notice.

Backend checks from repository root:
`DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASS='' DB_NAME=aromin_dev AROMIN_LOCAL_INTEGRATION=1 /workspace/aromin-venv/bin/python -m unittest discover -s deployment/tests -v`

Browser integration: install Playwright in a separate tools directory, install Chromium with PLAYWRIGHT_BROWSERS_PATH pointing below /workspace, start Vite, then run frontend/tests/browser/check.cjs with NODE_PATH pointing at those tool node_modules. The browser fixtures use synthetic data and intercepted API responses; the Python integration checks exercise actual local MariaDB and HTTP endpoints. No Telegram messages are sent.
