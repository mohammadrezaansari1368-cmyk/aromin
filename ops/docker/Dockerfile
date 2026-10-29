FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
COPY deployment/legacy.html /build/legacy.html
RUN node --input-type=module -e "import fs from 'node:fs'; const v=fs.readFileSync('/build/legacy.html','utf8').match(/APP_VERSION\s*=\s*\"([0-9.]+)\"/)[1]; const p='dist/widget.js'; fs.writeFileSync(p,fs.readFileSync(p,'utf8').replaceAll('__AROMIN_APP_VERSION__',v));"

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Asia/Tehran \
    AROMIN_STATE_DIR=/var/lib/aromin HTML_FILE=/app/legacy.html SPA_DIR=/app/web \
    AROMIN_SESSION_SECRET_FILE=/var/lib/aromin/.assistant-secrets/session.key \
    GOOGLE_SECRET_DIR=/var/lib/aromin/.assistant-secrets \
    PUB_MEDIA_DIR=/var/lib/aromin/media/pub RELEASE_DIR=/var/lib/aromin/releases \
    AROMIN_JOBS_ENABLED=1 AROMIN_RUN_MIGRATIONS=0 AROMIN_CONTAINER=1
WORKDIR /app/srv
COPY tools/cloud/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -r /tmp/requirements.lock \
    Pillow==11.3.0 arabic-reshaper==3.0.0 python-bidi==0.6.6 tzdata==2025.2 \
    && groupadd --gid 10001 aromin && useradd --uid 10001 --gid 10001 --no-create-home aromin \
    && mkdir -p /var/lib/aromin/.assistant-secrets /var/lib/aromin/media/pub /var/lib/aromin/releases \
    && chown -R 10001:10001 /var/lib/aromin
COPY deployment/*.py ./
COPY deployment/migrations/ ./migrations/
COPY deployment/assets/ ./assets/
COPY deployment/legacy.html /app/legacy.html
COPY --from=frontend /build/frontend/dist/ /app/web/
COPY ops/docker/entrypoint.py /app/entrypoint.py
USER 10001:10001
EXPOSE 3000
ENTRYPOINT ["python", "/app/entrypoint.py"]
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "1"]
