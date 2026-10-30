"""SQLite stand-in for pymysql in offline tests (copy of the test_publishing fake). Never a runtime backend."""
import re
import sqlite3
from pathlib import Path

import server


class Cursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def execute(self, sql, args=()):
        sql = sql.replace("%s", "?").replace(" FOR UPDATE", "").replace("INSERT IGNORE", "INSERT OR IGNORE")
        sql = re.sub(r" ON DUPLICATE KEY UPDATE (\w+)=\1$", " ON CONFLICT DO NOTHING", sql)   # no-op upsert used for lock rows
        try:
            self.cursor.execute(sql, tuple(args))
        except sqlite3.IntegrityError as error:
            raise server.pymysql.err.IntegrityError(1062, "duplicate") from error
        return self.cursor.rowcount

    @property
    def rowcount(self):
        return self.cursor.rowcount

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]

    def close(self):
        self.cursor.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class Connection:
    def __init__(self, path):
        self.connection = sqlite3.connect(path, isolation_level=None, detect_types=sqlite3.PARSE_DECLTYPES)
        self.connection.row_factory = sqlite3.Row

    def cursor(self):
        return Cursor(self.connection)

    def begin(self):
        self.connection.execute("BEGIN IMMEDIATE")

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


def load_schema(path, database):
    """Load a MariaDB migration into SQLite using the 005 rewrite rules plus secondary-KEY removal."""
    schema = Path(path).read_text(encoding="utf-8")
    schema = schema.replace("BIGINT AUTO_INCREMENT PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
    schema = re.sub(r"UNIQUE KEY \w+", "UNIQUE", schema)
    schema = re.sub(r",\s*KEY \w+ \([^)]*\)", "", schema)
    schema = schema.replace("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", "").replace("DATETIME", "TIMESTAMP")
    schema = re.sub(r"\s*COLLATE=\w+", "", schema)
    cx = sqlite3.connect(database)
    try:
        cx.executescript(schema)
    finally:
        cx.close()
