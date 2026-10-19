#!/bin/sh
# پشتیبان‌گیری روزانه دیتابیس (در crontab:  0 3 * * * /opt/aromin-hozour/deploy/backup.sh)
DIR="$(dirname "$0")/../server"
mkdir -p "$DIR/backups"
sqlite3 "$DIR/data/aromin.db" ".backup '$DIR/backups/aromin-$(date +%F).db'" 2>/dev/null \
  || cp "$DIR/data/aromin.db" "$DIR/backups/aromin-$(date +%F).db"
find "$DIR/backups" -name 'aromin-*.db' -mtime +30 -delete
